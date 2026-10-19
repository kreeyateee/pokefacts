/**
 * Home start path: check the local data, build, then serve Champdex.
 * Yoto login uses the loopback redirect. A public tunnel is not required.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { productionBuildArgs } from "./next-build-args.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await readFile(new URL("../src/lib/local-origin.json", import.meta.url), "utf8"),
);
const checkOnly = process.argv.includes("--check");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function nodeIsNewEnough() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 14);
}

function ffmpegHint() {
  if (process.platform === "win32") {
    return "Install ffmpeg, then open a new terminal:\n  winget install Gyan.FFmpeg";
  }
  if (process.platform === "darwin") {
    return "Install ffmpeg:\n  brew install ffmpeg";
  }
  return "Install ffmpeg:\n  sudo apt-get update && sudo apt-get install -y ffmpeg";
}

const WINGET_FFMPEG_902 =
  "C:\\Users\\mjlan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin";

/** Use the installed ffmpeg even when PATH still names the deleted 8.1.2 folder. */
function ffmpegLaunch() {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const preferred = path.join(WINGET_FFMPEG_902, exe);
  if (existsSync(preferred)) return preferred;
  return "ffmpeg";
}

function useFfmpeg() {
  const command = ffmpegLaunch();
  if (command !== "ffmpeg") {
    const dir = path.dirname(command);
    const current = process.env.PATH ?? "";
    const listed = current
      .split(path.delimiter)
      .some((entry) => entry.length > 0 && path.resolve(entry).toLowerCase() === path.resolve(dir).toLowerCase());
    if (!listed) {
      const next = `${dir}${path.delimiter}${current}`;
      process.env.PATH = next;
      if (process.platform === "win32") process.env.Path = next;
    }
  }
  return command;
}

function ffmpegOnPath() {
  const command = useFfmpeg();
  return new Promise((resolve) => {
    execFile(command, ["-version"], { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function countNames(dir, pattern) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => pattern.test(name)).length;
  } catch {
    return 0;
  }
}

if (!nodeIsNewEnough()) {
  fail(
    `Champdex needs Node.js 22.14 or newer. This machine is running ${process.versions.node}.\n` +
      "Install the 22 line from https://nodejs.org/ and open a new terminal.",
  );
}

if (!(await ffmpegOnPath())) {
  fail(
    `ffmpeg is not on PATH. Champdex uses it to put each cry in front of Lily's voice.\n${ffmpegHint()}`,
  );
}

const sqlitePath = path.join(root, "data", "champdex.sqlite");
if (!(await exists(sqlitePath))) {
  const csvDir = process.env.CATALOGUE_CSV ?? "/tmp/poke-csv";
  const marker = path.join(csvDir, "pokemon_species_flavor_text.csv");
  if (await exists(marker)) {
    console.log("data/champdex.sqlite is missing. Building it from the PokéAPI tables…");
    const code = await run(process.execPath, [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(root, "scripts", "build-catalogue.ts"),
    ]);
    if (code !== 0 || !(await exists(sqlitePath))) {
      fail(
        "Could not build data/champdex.sqlite. The catalogue uses PokéAPI game data. Champdex does not copy Bulbapedia articles.",
      );
    }
  } else {
    fail(
      "data/champdex.sqlite is missing.\n" +
        "That file ships with the Champdex git repository, together with public/sprites and public/pixels.\n" +
        "Clone the full repository, or restore those paths from git.\n" +
        "If the PokéAPI CSV tables are already on this computer, put them in /tmp/poke-csv and run: npm run catalogue\n" +
        "Champdex does not copy Bulbapedia articles.",
    );
  }
}

let species = 0;
try {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM species").get();
    species = Number(row?.n ?? 0);
  } finally {
    db.close();
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : "unknown error";
  fail(
    `data/champdex.sqlite could not be read (${detail}).\n` +
      "Restore it from the git repository, or run npm run catalogue when the PokéAPI CSV tables are in /tmp/poke-csv.",
  );
}
if (species < 1025) {
  fail(
    `data/champdex.sqlite has ${species} species. It needs all 1,025.\n` +
      "Restore the file from git, or run npm run catalogue.",
  );
}

const sprites = await countNames(path.join(root, "public", "sprites"), /^\d+\.png$/);
const pixels = await countNames(path.join(root, "public", "pixels"), /^\d+\.png$/);
const shadows = await countNames(path.join(root, "public", "pixels"), /^\d+-shadow\.png$/);
if (sprites < 1025 || pixels < 1025 || shadows < 1025) {
  fail(
    `Pictures are incomplete (sprites ${sprites}/1025, pixels ${pixels}/1025, shadows ${shadows}/1025).\n` +
      "public/sprites and public/pixels ship with the git repository. Restore them from git.",
  );
}

const origin = config.origin;
const redirect = config.redirectUri;
console.log("");
console.log("Champdex");
console.log(`Open ${origin}`);
console.log(`Yoto redirect URI: ${redirect}`);
console.log("A public tunnel is not required. Leave this window open while the cards upload.");
console.log("");

if (checkOnly) process.exit(0);

const buildArgs = productionBuildArgs();
console.log(
  buildArgs.includes("--webpack")
    ? "Building the production app with Webpack…"
    : "Building the production app…",
);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const buildCode = await run(process.execPath, [nextBin, ...buildArgs]);
if (buildCode !== 0) {
  fail("The production build failed. Fix the error above, then run npm start again.");
}

console.log("");
console.log(`Champdex is at ${origin}`);
console.log(`Allow this redirect in the Yoto developer dashboard: ${redirect}`);
console.log("");

const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", config.hostname, "--port", String(config.port)],
  { cwd: root, stdio: "inherit", windowsHide: true },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.on("exit", (code, signal) => {
  process.exit(signal ? 0 : (code ?? 0));
});
