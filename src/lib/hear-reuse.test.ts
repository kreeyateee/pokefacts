import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { demoHearBody } from "@/lib/voice-choice";
import { prepareDemoAudio } from "@/lib/yoto-demo";
import { speechKey } from "@/lib/yoto-fact-audio";

test("Hear plays a line a card send already recorded, without asking Yoto again", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pokefacts-hear-"));
  try {
    const george = "JBFqnCBsd6RMkjVDRZzb";
    const request = demoHearBody({ text: "Psyduck  has a   headache.", title: "Psyduck", voiceId: george });
    const saved = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 7)]);
    await mkdir(path.join(dir, "speech"), { recursive: true });
    // The name a card send gives it: voice and words, with the spacing tidied.
    await writeFile(path.join(dir, "speech", `${speechKey("Psyduck has a headache.", george)}.mp3`), saved);
    const noYoto = (async () => {
      throw new Error("Yoto should not be asked.");
    }) as typeof fetch;
    const audio = await prepareDemoAudio("x".repeat(24), request, noYoto, { speech: path.join(dir, "speech") });
    assert.deepEqual(audio.audio, saved);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
