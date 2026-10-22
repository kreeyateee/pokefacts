import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { audioContainer, describeClip, isPlainYotoMp3 } from "./cry-audio";
import { ffmpegCommand } from "./ffmpeg-bin";
import { parseDownloadLines, youtubeTarget, youtubeWatchUrl } from "./youtube-link";
import {
  downloadContainer,
  explainYtdlpFailure,
  isDownloadPath,
  parseDownloadedAudio,
  ytdlpLaunch,
  ytdlpMp3Args,
  ytdlpOutput,
  ytdlpStoppedAfterLimit,
} from "./youtube-mp3";
import { LOCAL_MODE_ENV } from "./youtube-mp3-site";

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegCommand(), ["-y", "-loglevel", "error", ...args], { timeout: 20_000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("public site", () => {
  it("does not start yt-dlp unless the home launcher started the server", async () => {
    const before = process.env[LOCAL_MODE_ENV];
    delete process.env[LOCAL_MODE_ENV];
    try {
      await assert.rejects(() => ytdlpOutput(["--version"], 5_000), /works only when Pokefacts runs on this computer/);
    } finally {
      if (before !== undefined) process.env[LOCAL_MODE_ENV] = before;
    }
  });
});

describe("youtube links", () => {
  it("keeps a video link as one video and a list link as a playlist", () => {
    assert.deepEqual(youtubeTarget("https://www.youtube.com/watch?v=R4GIyJxvk94"), {
      url: "https://www.youtube.com/watch?v=R4GIyJxvk94",
      playlist: false,
    });
    assert.deepEqual(youtubeTarget("https://youtu.be/YnPs8BwkyMY"), {
      url: "https://www.youtube.com/watch?v=YnPs8BwkyMY",
      playlist: false,
    });
    assert.equal(youtubeTarget("https://www.youtube.com/watch?v=R4GIyJxvk94&list=PLabcdefghij")?.playlist, true);
    assert.equal(youtubeTarget("https://www.youtube.com/playlist?list=PLabcdefghij")?.url, "https://www.youtube.com/playlist?list=PLabcdefghij");
    assert.equal(youtubeTarget("https://music.youtube.com/playlist?list=OLAK5uy_abcdefghij")?.playlist, true);
    assert.equal(youtubeTarget("https://example.com/watch?v=R4GIyJxvk94"), null);
    assert.equal(youtubeTarget("not a url"), null);
    assert.equal(youtubeWatchUrl("R4GIyJxvk94"), "https://www.youtube.com/watch?v=R4GIyJxvk94");
  });

  it("reads playlist rows in order and skips log lines", () => {
    const stdout = [
      "[download] Destination: ignored.webm",
      `R4GIyJxvk94\u001fPokémon Theme\u001f/tmp/songs/001-R4GIyJxvk94.webm`,
      `PIetiD0G6vQ\u001fWorld\u001f/tmp/songs/002-PIetiD0G6vQ.mp3`,
      `R4GIyJxvk94\u001fagain\u001f/tmp/songs/dup.mp3`,
    ].join("\n");
    const rows = parseDownloadLines(stdout);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["R4GIyJxvk94", "PIetiD0G6vQ"],
    );
    assert.equal(rows[0]?.title, "Pokémon Theme");
    assert.equal(rows[0]?.file.endsWith(".webm"), true);
  });
});

describe("yt-dlp mp3 arguments", () => {
  it("converts a playlist to mp3 and leaves a single video out of the playlist", () => {
    const playlist = ytdlpMp3Args({
      url: "https://www.youtube.com/playlist?list=PLabcdefghij",
      outputDir: "/tmp/songs",
      playlist: true,
      limit: 100,
      ffmpegDir: "/usr/bin",
    });
    assert.ok(playlist.includes("bestaudio/best"));
    assert.ok(playlist.includes("--audio-format"));
    assert.equal(playlist[playlist.indexOf("--audio-format") + 1], "mp3");
    assert.equal(playlist[playlist.indexOf("--audio-quality") + 1], "192");
    assert.ok(playlist.includes("--yes-playlist"));
    assert.ok(playlist.includes("--playlist-end"));
    assert.equal(playlist.includes("--no-playlist"), false);

    const video = ytdlpMp3Args({
      url: "https://www.youtube.com/watch?v=R4GIyJxvk94",
      outputDir: "/tmp/songs",
      playlist: false,
      limit: 1,
    });
    assert.ok(video.includes("--no-playlist"));
    assert.equal(video.includes("--yes-playlist"), false);
    assert.equal(video.includes("--max-downloads"), false);
    assert.equal(playlist.includes("--max-downloads"), false);
  });

  it("keeps a finished download when yt-dlp stops at its own limit", () => {
    const stdout = "8xxgBFYQTL4\u001fPokémon Johto\u001fC:\\songs\\8xxgBFYQTL4.mp3\nAborting remaining downloads\n";
    assert.equal(ytdlpStoppedAfterLimit(101, stdout, ""), true);
    assert.equal(ytdlpStoppedAfterLimit(1, stdout, ""), false);
    assert.equal(explainYtdlpFailure("", "", {}), "yt-dlp could not download that audio.");
    assert.equal(
      explainYtdlpFailure("", "ERROR: ffmpeg not found\n", {}),
      "ffmpeg not found",
    );
    assert.equal(
      explainYtdlpFailure("ERROR: [youtube] 8xxgBFYQTL4: This video is not available\n", "", {}),
      "[youtube] 8xxgBFYQTL4: This video is not available",
    );
  });

  it("runs the packaged yt-dlp module with Python", () => {
    const launch = ytdlpLaunch({
      root: path.join("/app", "pokefacts"),
      python: { command: "python", prefix: [] },
      exists: (file) => file.endsWith(`${path.sep}yt_dlp${path.sep}__main__.py`),
      envCommand: "",
      homeBin: path.join("/missing", "yt-dlp"),
      baseEnv: { PATH: path.join("/usr", "bin"), NODE_ENV: "test" },
    });
    assert.equal(launch.command, "python");
    assert.deepEqual(launch.args, ["-m", "yt_dlp"]);
    assert.equal(launch.packaged, true);
    assert.equal(launch.python, true);
    assert.match(launch.env.PYTHONPATH ?? "", /vendor[/\\]yt-dlp$/);
    assert.equal(launch.deno, null);
  });

  it("passes the packaged Deno binary to every yt-dlp launch", () => {
    const root = path.join("/app", "pokefacts");
    const deno = path.join(root, "vendor", "deno", process.platform === "win32" ? "deno.exe" : "deno");
    const launch = ytdlpLaunch({
      root,
      python: { command: "python", prefix: [] },
      exists: (file) => file.endsWith(`${path.sep}yt_dlp${path.sep}__main__.py`) || file === deno,
      envCommand: "",
      homeBin: path.join("/missing", "yt-dlp"),
      baseEnv: { PATH: path.join("/usr", "bin"), NODE_ENV: "test" },
    });
    assert.equal(launch.deno, deno);
    assert.equal(launch.args[launch.args.indexOf("--js-runtimes") + 1], `deno:${deno}`);
    assert.equal(launch.env.DENO_DIR, path.join(root, "vendor", "deno", "cache"));
    assert.equal(launch.env.DENO_NO_UPDATE_CHECK, "1");
  });

  it("only reads files inside the download folder", () => {
    assert.equal(isDownloadPath("/tmp/songs", "/tmp/songs/track.mp3"), true);
    assert.equal(isDownloadPath("/tmp/songs", "/tmp/songs-extra/track.mp3"), false);
    assert.equal(isDownloadPath("/tmp/songs", "/tmp/songs/../secret.mp3"), false);
  });
});

describe("parse downloads as mp3", () => {
  it("turns a webm and a vbr mp3 into a plain mp3 the playlist can store", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-mp3-"));
    try {
      const webm = path.join(dir, "song.webm");
      const vbr = path.join(dir, "song.mp3");
      await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", "-f", "webm", webm]);
      await ffmpeg([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=2",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "5",
        "-ar",
        "48000",
        "-ac",
        "2",
        vbr,
      ]);
      const webmBytes = await readFile(webm);
      const vbrBytes = await readFile(vbr);
      assert.equal(downloadContainer(webmBytes), "webm");
      assert.equal(audioContainer(webmBytes), null);
      assert.equal(downloadContainer(vbrBytes), "mp3");
      const vbrInfo = await describeClip(vbrBytes, "vbr.mp3");
      assert.equal(isPlainYotoMp3(vbrBytes, vbrInfo), false);

      for (const bytes of [webmBytes, vbrBytes]) {
        const mp3 = await parseDownloadedAudio(bytes);
        assert.equal(audioContainer(mp3), "mp3");
        const info = await describeClip(mp3, "plain.mp3");
        assert.equal(isPlainYotoMp3(mp3, info), true);
        assert.equal(info.codec, "mp3");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
