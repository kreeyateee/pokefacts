import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const memory = new Map<string, Record<string, unknown>>();
let writes = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = writes.then(task, task);
  writes = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Read a JSON object. A second caller in this process reuses the parsed copy. */
export async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  const known = memory.get(file);
  if (known) return known;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    parsed = null;
  }
  const current = memory.get(file);
  if (current) return current;
  const rows =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  memory.set(file, rows);
  return rows;
}

async function writeJsonAtomic(file: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tmp, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    await rm(tmp, { force: true }).catch(() => undefined);
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") throw error;
    const retry = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.retry.tmp`);
    await writeFile(retry, `${JSON.stringify(value, null, 2)}\n`);
    await rm(file, { force: true });
    try {
      await rename(retry, file);
    } catch (renameError) {
      await rm(retry, { force: true });
      throw renameError;
    }
  }
}

/** Replace one key and publish the whole object in one rename, so readers never see a torn file. */
export async function updateJsonObject(file: string, key: string, value: unknown): Promise<void> {
  await enqueue(async () => {
    const all = memory.get(file) ?? (await readJsonObject(file));
    all[key] = value;
    memory.set(file, all);
    await writeJsonAtomic(file, all);
  });
}
