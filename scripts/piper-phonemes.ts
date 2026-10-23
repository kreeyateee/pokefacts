/**
 * See the sounds Piper will say. Piper's own espeak step turns each line into
 * IPA, and `--debug` prints it, so this reads that log.
 *
 *   npx tsx scripts/piper-phonemes.ts "Mewtwo and Charmeleon"   one line, before and after piperSpeech
 *   npx tsx scripts/piper-phonemes.ts --names                    every Pokémon name, before and after
 *   npx tsx scripts/piper-phonemes.ts --check                    the respellings still give the IPA in piper-ipa.json
 *   npx tsx scripts/piper-phonemes.ts --write                    save the current IPA to piper-ipa.json
 *   npx tsx scripts/piper-phonemes.ts --raw "Peeka choo" ...     IPA for respellings to try, as written
 *
 * Add a respelling to src/lib/piper-pronounce.ts, look at its IPA here, then `--write`.
 * Piper must be installed in data/piper (`npx tsx scripts/install-piper.ts`).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PIPER_MODEL_NAME } from "../src/lib/piper-voice";
import { PIPER_SAID_WORDS, piperSpeech } from "../src/lib/piper-pronounce";

const ROOT = path.join(import.meta.dirname, "..");
const PIPER_DIR = path.join(ROOT, "data", "piper");
const SNAPSHOT = path.join(import.meta.dirname, "piper-ipa.json");

async function findExe(dir: string, depth = 0): Promise<string | null> {
  if (depth > 3 || !existsSync(dir)) return null;
  const want = process.platform === "win32" ? "piper.exe" : "piper";
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) if (entry.isFile() && entry.name.toLowerCase() === want) return path.join(dir, entry.name);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "espeak-ng-data") continue;
    const found = await findExe(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/** IPA for each line, as Piper's espeak step makes it. Sentences in one line are joined with " | ". */
export async function phonemes(lines: readonly string[]): Promise<string[]> {
  const bin = await findExe(path.join(PIPER_DIR, "runtime"));
  const model = path.join(PIPER_DIR, "voices", `${PIPER_MODEL_NAME}.onnx`);
  if (!bin || !existsSync(model)) throw new Error("Piper is not installed. Run npx tsx scripts/install-piper.ts");
  const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-phonemes-"));
  try {
    const log = await new Promise<string>((resolve, reject) => {
      // A tiny length scale keeps the throwaway audio short. The phonemes do not change.
      const args = ["--model", model, "--output_dir", dir, "--length_scale", "0.2", "--debug"];
      const child = spawn(bin, args, { cwd: path.dirname(bin), windowsHide: true });
      const chunks: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (code === 0) resolve(text);
        else reject(new Error(text.trim().split(/\r?\n/).at(-1) || "Piper failed."));
      });
      child.stdin.end(lines.map((line) => line.replace(/\s+/g, " ").trim()).join("\n") + "\n", "utf8");
    });
    const out: string[] = [];
    for (const row of log.split(/\r?\n/)) {
      if (row.includes("] Phonemizing text: ")) out.push("");
      const said = row.match(/Converting \d+ phoneme\(s\) to ids: (.*)$/);
      if (said && out.length) out[out.length - 1] = out[out.length - 1] ? `${out[out.length - 1]} | ${said[1]}` : said[1];
    }
    if (out.length !== lines.length) throw new Error(`Expected ${lines.length} lines of phonemes, got ${out.length}.`);
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Snapshot = Record<string, { said: string; before: string; after: string }>;

async function speciesNames(): Promise<string[]> {
  const raw = await readFile(path.join(ROOT, "src", "data", "species-names.json"), "utf8");
  return (JSON.parse(raw) as { name: string }[]).map((row) => row.name);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] ?? "--check";
  if (mode === "--names") {
    const names = await speciesNames();
    const before = await phonemes(names);
    // Only respelled names need a second reading.
    const changed = names.filter((name) => piperSpeech(name) !== name);
    const after = new Map((await phonemes(changed.map(piperSpeech))).map((said, i) => [changed[i], said]));
    names.forEach((name, i) => {
      const said = after.get(name);
      console.log(said ? `* ${name}\t${before[i]}\t${piperSpeech(name)}\t${said}` : `  ${name}\t${before[i]}`);
    });
    return;
  }
  if (mode === "--check" || mode === "--write") {
    const words = PIPER_SAID_WORDS;
    const before = await phonemes(words);
    const after = await phonemes(words.map(piperSpeech));
    const now: Snapshot = {};
    words.forEach((word, i) => {
      now[word] = { said: piperSpeech(word), before: before[i], after: after[i] };
    });
    if (mode === "--write") {
      await writeFile(SNAPSHOT, `${JSON.stringify(now, null, 2)}\n`, "utf8");
      console.log(`Saved ${words.length} words to ${path.relative(ROOT, SNAPSHOT)}.`);
      return;
    }
    const saved = existsSync(SNAPSHOT) ? (JSON.parse(await readFile(SNAPSHOT, "utf8")) as Snapshot) : {};
    let wrong = 0;
    for (const word of words) {
      const want = saved[word]?.after;
      const got = now[word].after;
      if (want === got) continue;
      wrong += 1;
      console.log(`${word}: ${want ? `wanted ${want}` : "not in piper-ipa.json"}, Piper says ${got}`);
    }
    for (const word of Object.keys(saved)) {
      if (!(word in now)) console.log(`${word}: in piper-ipa.json but no longer respelled`);
    }
    console.log(wrong ? `${wrong} of ${words.length} words changed.` : `All ${words.length} words match.`);
    if (wrong) process.exitCode = 1;
    return;
  }
  if (mode === "--raw") {
    // Try respellings: one line each, read as written, from the arguments or a file.
    const lines = args[1] && existsSync(args[1]) ? (await readFile(args[1], "utf8")).split(/\r?\n/).filter(Boolean) : args.slice(1);
    const said = await phonemes(lines);
    lines.forEach((line, i) => console.log(`${line}\t${said[i]}`));
    return;
  }
  const lines = args;
  const before = await phonemes(lines);
  const after = await phonemes(lines.map(piperSpeech));
  lines.forEach((line, i) => {
    console.log(line);
    console.log(`  before  ${before[i]}`);
    console.log(`  after   ${piperSpeech(line)}`);
    console.log(`          ${after[i]}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
