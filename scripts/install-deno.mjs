/**
 * Install the Deno binary into vendor/deno.
 * yt-dlp 2026.08.19 pins Deno 2.9.5 for the YouTube player solver.
 * The app runs this copy. A global Deno install is not required.
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const DENO_VERSION = "2.9.5";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destDir = path.join(root, "vendor", "deno");
const exeName = process.platform === "win32" ? "deno.exe" : "deno";
const exe = path.join(destDir, exeName);

function assetName() {
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : "";
  if (!arch) return "";
  if (process.platform === "win32") return `deno-${arch}-pc-windows-msvc.zip`;
  if (process.platform === "darwin") return `deno-${arch}-apple-darwin.zip`;
  if (process.platform === "linux") return `deno-${arch}-unknown-linux-gnu.zip`;
  return "";
}

function versionOf(file) {
  const result = spawnSync(file, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 20_000 });
  if (result.status !== 0) return "";
  const match = /^deno (\S+)/m.exec(result.stdout ?? "");
  return match?.[1] ?? "";
}

if (existsSync(exe) && versionOf(exe) === DENO_VERSION) {
  console.log(`Packaged Deno ${DENO_VERSION} is already in vendor/deno`);
  process.exit(0);
}

const asset = assetName();
if (!asset) {
  console.error(`No Deno build is packaged for ${process.platform} ${process.arch}.`);
  process.exit(1);
}

const url = `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${asset}`;
await mkdir(destDir, { recursive: true });
const zip = path.join(destDir, asset);
console.log(`Downloading ${url}`);
const response = await fetch(url, { headers: { "User-Agent": "pokefacts" }, redirect: "follow" });
if (!response.ok || !response.body) {
  console.error(`Deno download failed (${response.status} ${response.statusText}).`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(zip));
const extracted = spawnSync("tar", ["-xf", zip, "-C", destDir], { stdio: "inherit", windowsHide: true });
await rm(zip, { force: true });
if (extracted.status !== 0) process.exit(extracted.status ?? 1);
if (process.platform !== "win32") await chmod(exe, 0o755);
const version = versionOf(exe);
if (version !== DENO_VERSION) {
  console.error(`Expected Deno ${DENO_VERSION} at ${exe}, got ${version || "nothing"}.`);
  process.exit(1);
}
console.log(`Packaged Deno ${version} in vendor/deno`);
