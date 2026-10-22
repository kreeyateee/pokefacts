import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PIPER_MODEL_NAME } from "@/lib/piper-voice";

/**
 * Official Piper lives here. The binary and the voice model are large, so this
 * folder is gitignored. The first Piper Hear or Send downloads them once.
 * `npx tsx scripts/install-piper.ts` does the same download ahead of time.
 */
const PIPER_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "piper");

const RELEASE = "2023.11.14-2";
const RELEASE_BASE = `https://github.com/rhasspy/piper/releases/download/${RELEASE}`;

type PiperArchive = {
  url: string;
  name: string;
};

/**
 * Official Piper build for this OS. Oracle Pokefacts is Linux x86_64.
 * A missing row means this computer cannot download a binary.
 */
export function piperReleaseArchive(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): PiperArchive | null {
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return { url: `${RELEASE_BASE}/piper_windows_amd64.zip`, name: "piper_windows_amd64.zip" };
  }
  if (platform === "linux" && arch === "x64") {
    return { url: `${RELEASE_BASE}/piper_linux_x86_64.tar.gz`, name: "piper_linux_x86_64.tar.gz" };
  }
  if (platform === "linux" && arch === "arm64") {
    return { url: `${RELEASE_BASE}/piper_linux_aarch64.tar.gz`, name: "piper_linux_aarch64.tar.gz" };
  }
  if (platform === "darwin" && arch === "arm64") {
    return { url: `${RELEASE_BASE}/piper_macos_aarch64.tar.gz`, name: "piper_macos_aarch64.tar.gz" };
  }
  if (platform === "darwin" && arch === "x64") {
    return { url: `${RELEASE_BASE}/piper_macos_x64.tar.gz`, name: "piper_macos_x64.tar.gz" };
  }
  return null;
}

/**
 * Slightly slower, more even timing than Piper's conversational defaults.
 * That is the handheld Pokédex cadence on a 1-OCPU host.
 */
export const PIPER_POKEDEX_ARGS = [
  "--length_scale",
  "1.12",
  "--noise_scale",
  "0.333",
  "--noise_w",
  "0.4",
  "--sentence_silence",
  "0.35",
] as const;

const VOICE_FILES = [
  {
    name: "en_GB-cori-high",
    onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx",
    json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx.json",
  },
  {
    name: "en_GB-cori-medium",
    onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx",
    json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx.json",
  },
  {
    name: "en_GB-alba-medium",
    onnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx",
    json: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json",
  },
] as const;

type PiperInstall = {
  bin: string;
  model: string;
  modelName: string;
};

export type PiperCommand = {
  command: string;
  args: string[];
  /** Sentence written to Piper's stdin. */
  input: string;
  cwd: string;
  output: string;
};

export type PiperSynthOptions = {
  bin?: string;
  model?: string;
  /** When false, a missing binary is an error. The app does not download it. */
  download?: boolean;
  run?: (command: PiperCommand) => Promise<Buffer>;
};

const MISSING = "Piper is not installed.";

function exeName(): string {
  return process.platform === "win32" ? "piper.exe" : "piper";
}

function defaultPiperBin(): string {
  return path.join(PIPER_DIR, "runtime", exeName());
}

function defaultPiperModel(): string {
  return path.join(PIPER_DIR, "voices", `${PIPER_MODEL_NAME}.onnx`);
}

/** Local Piper invocation. The model path is the onnx file, not an ElevenLabs voice id. */
export function piperSpeechCommand(input: {
  text: string;
  output: string;
  bin?: string;
  model?: string;
}): PiperCommand {
  const command = input.bin || defaultPiperBin();
  const model = input.model || defaultPiperModel();
  return {
    command,
    args: ["--model", model, "--output_file", input.output, ...PIPER_POKEDEX_ARGS],
    input: input.text,
    cwd: path.dirname(command),
    output: input.output,
  };
}

async function fileAtLeast(file: string, bytes: number): Promise<boolean> {
  try {
    const info = await stat(file);
    return info.size >= bytes;
  } catch {
    return false;
  }
}

async function downloadTo(url: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  await rm(part, { force: true });
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error("Piper could not be downloaded.");
  await writeFile(part, Buffer.from(await response.arrayBuffer()));
  await rm(dest, { force: true });
  await rename(part, dest);
}

function runFile(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.trim().split(/\r?\n/).at(-1) ?? "";
      reject(new Error(tail || "Piper could not be unpacked."));
    });
  });
}

async function findExe(root: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const wanted = exeName().toLowerCase();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === wanted) return path.join(root, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "espeak-ng-data" || entry.name === "voices") continue;
    const found = await findExe(path.join(root, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function installedModel(): Promise<{ model: string; modelName: string } | null> {
  const voices = path.join(PIPER_DIR, "voices");
  for (const voice of VOICE_FILES) {
    const model = path.join(voices, `${voice.name}.onnx`);
    const config = `${model}.json`;
    if ((await fileAtLeast(model, 1_000_000)) && (await fileAtLeast(config, 100))) {
      return { model, modelName: voice.name };
    }
  }
  return null;
}

async function installBinary(): Promise<string> {
  const existing = await findExe(PIPER_DIR);
  if (existing) return existing;
  const archive = piperReleaseArchive();
  if (!archive) throw new Error(MISSING);
  const packed = path.join(/* turbopackIgnore: true */ PIPER_DIR, archive.name);
  if (!(await fileAtLeast(packed, 1_000_000))) await downloadTo(archive.url, packed);
  const runtime = path.join(PIPER_DIR, "runtime");
  await mkdir(runtime, { recursive: true });
  await runFile("tar", ["-xf", packed, "-C", runtime]);
  const exe = await findExe(runtime);
  if (!exe) throw new Error(MISSING);
  if (process.platform !== "win32") await chmod(exe, 0o755);
  return exe;
}

async function installVoice(): Promise<{ model: string; modelName: string }> {
  const present = await installedModel();
  if (present) return present;
  const voices = path.join(PIPER_DIR, "voices");
  await mkdir(voices, { recursive: true });
  let last = "Piper could not be downloaded.";
  for (const voice of VOICE_FILES) {
    const model = path.join(voices, `${voice.name}.onnx`);
    const config = `${model}.json`;
    try {
      if (!(await fileAtLeast(model, 1_000_000))) await downloadTo(voice.onnx, model);
      if (!(await fileAtLeast(config, 100))) await downloadTo(voice.json, config);
      if ((await fileAtLeast(model, 1_000_000)) && (await fileAtLeast(config, 100))) {
        return { model, modelName: voice.name };
      }
    } catch (error) {
      last = error instanceof Error && error.message ? error.message : last;
      await rm(model, { force: true });
      await rm(config, { force: true });
    }
  }
  throw new Error(last.length < 80 ? last : "Piper could not be downloaded.");
}

let pending: Promise<PiperInstall> | null = null;

/** Download the official Piper build for this OS and a British reader voice, once. */
export function ensurePiper(): Promise<PiperInstall> {
  if (!pending) {
    pending = Promise.all([installBinary(), installVoice()])
      .then(([bin, voice]) => ({ bin, model: voice.model, modelName: voice.modelName }))
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

async function locate(options: PiperSynthOptions): Promise<{ bin: string; model: string }> {
  if (options.run || options.download === false) {
    return {
      bin: options.bin || defaultPiperBin(),
      model: options.model || defaultPiperModel(),
    };
  }
  if (options.bin && options.model && existsSync(options.bin) && existsSync(options.model)) {
    return { bin: options.bin, model: options.model };
  }
  const installed = await ensurePiper();
  return { bin: installed.bin, model: installed.model };
}

function runPiper(spec: PiperCommand): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, windowsHide: true });
    const stderr: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      reject(new Error(code === "ENOENT" ? MISSING : "Piper could not read this line."));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const tail = Buffer.concat(stderr).toString("utf8").trim().split(/\r?\n/).at(-1) ?? "";
        reject(new Error(tail && tail.length < 160 ? tail : "Piper could not read this line."));
        return;
      }
      readFile(spec.output)
        .then((wav) => {
          if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
            reject(new Error("Piper did not write a recording."));
            return;
          }
          resolve(wav);
        })
        .catch(() => {
          reject(new Error("Piper did not write a recording."));
        });
    });
    child.stdin?.end(`${spec.input}\n`, "utf8");
  });
}

/** Speak one line with the local Piper binary. A missing binary does not call Yoto. */
export async function synthesizePiper(text: string, options: PiperSynthOptions = {}): Promise<Buffer> {
  const located = await locate(options);
  const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-piper-"));
  const output = path.join(dir, "speech.wav");
  const spec = piperSpeechCommand({
    text,
    output,
    bin: located.bin,
    model: located.model,
  });
  try {
    if (options.run) return await options.run(spec);
    if (!existsSync(located.bin) || !existsSync(located.model)) throw new Error(MISSING);
    return await runPiper(spec);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
