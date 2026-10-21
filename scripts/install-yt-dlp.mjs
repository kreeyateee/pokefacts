/**
 * Install yt-dlp and its packaged files into vendor/yt-dlp.
 * The app runs this copy with Python 3. A global pip install is not required.
 */
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "vendor", "yt-dlp");

const candidates =
  process.platform === "win32"
    ? [
        ["py", ["-3"]],
        ["python", []],
        ["python3", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];

function pythonLauncher() {
  for (const [command, prefix] of candidates) {
    const check = spawnSync(command, [...prefix, "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"], {
      windowsHide: true,
      timeout: 15_000,
    });
    if (check.status === 0) return { command, prefix };
  }
  return null;
}

const python = pythonLauncher();
if (!python) {
  console.error("Python 3.9 or newer is required to install the packaged yt-dlp.");
  process.exit(1);
}

await mkdir(target, { recursive: true });
const install = spawnSync(
  python.command,
  [...python.prefix, "-m", "pip", "install", "--upgrade", "--target", target, "yt-dlp"],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (install.status !== 0) process.exit(install.status ?? 1);

const ejs = spawnSync(
  python.command,
  [...python.prefix, "-m", "pip", "install", "--upgrade", "--target", target, "--no-deps", "yt-dlp-ejs==0.8.0"],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (ejs.status !== 0) process.exit(ejs.status ?? 1);

const version = spawnSync(python.command, [...python.prefix, "-m", "yt_dlp", "--version"], {
  cwd: root,
  windowsHide: true,
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: target },
});
if (version.status !== 0) {
  console.error(version.stderr || "The packaged yt-dlp did not start.");
  process.exit(version.status ?? 1);
}
console.log(`Packaged yt-dlp ${version.stdout.trim()} in vendor/yt-dlp`);
