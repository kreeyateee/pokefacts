import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listMonSheets } from "@/lib/catalogue-db";
import { measuresInUnits, quickFacts, quickHeight, quickWeight, shortDexLine } from "@/lib/dex-facts";
import { cleanFlavor } from "@/lib/format";
import { factParts } from "@/lib/kid-cards";
import { PIPER_VOICE_ID } from "@/lib/piper-voice";
import { readTrackParts, SEND_VOICE, withSavedTakes, withSendVoice } from "@/lib/story/story-voices";

const sheets = listMonSheets();
const sheet = (id: number) => sheets.find((row) => row.id === id)!;

describe("quick facts", () => {
  it("say the name, kind, type, a Pokédex line, size, ability and evolution, in that order", () => {
    const pikachu = quickFacts(sheet(25));
    assert.match(
      pikachu,
      /^Pikachu\. The Mouse Pokémon\. Electric type\. The Pokédex says: .+\. 40 centimetres tall, 6 kilograms\. Ability: Static\. Evolves from Pichu by leveling up once it is very happy\. Evolves into Raichu with a Thunder Stone\.$/,
    );
  });

  it("are calm: no exclamation marks anywhere", () => {
    for (const row of sheets) assert.doesNotMatch(quickFacts(row), /!/, row.name);
  });

  it("stay short enough to be quick", () => {
    // A little room for the evolutions that depend on stats, such as Tyrogue's.
    for (const row of sheets) assert.ok(quickFacts(row).split(/\s+/).length <= 72, row.name);
  });

  it("use metres from a metre up, and grams under a kilogram", () => {
    assert.equal(quickHeight(4), "40 centimetres");
    assert.equal(quickHeight(10), "1 metre");
    assert.equal(quickHeight(17), "1.7 metres");
    assert.equal(quickWeight(1), "100 grams");
    assert.equal(quickWeight(10), "1 kilogram");
    assert.equal(quickWeight(905), "90.5 kilograms");
  });

  it("say how and when it evolves, name a long list briefly, and say when there is none", () => {
    assert.match(quickFacts(sheet(4)), /Evolves into Charmeleon at level 16\.$/);
    assert.match(quickFacts(sheet(5)), /Evolves from Charmander at level 16\. Evolves into Charizard at level 36\.$/);
    assert.match(quickFacts(sheet(6)), /Evolves from Charmeleon at level 36\.$/);
    assert.match(
      quickFacts(sheet(133)),
      /Evolves into Vaporeon with a Water Stone, Jolteon with a Thunder Stone, Flareon with a Fire Stone, and 5 more\./,
    );
    assert.match(quickFacts(sheet(132)), /Does not evolve\./);
  });

  it("say sizes in feet, inches, pounds and ounces when imperial is picked", () => {
    assert.match(measuresInUnits(quickFacts(sheet(4)), "imperial"), / 2 feet tall, 19 pounds\. /);
    assert.match(measuresInUnits(quickFacts(sheet(92)), "imperial"), / 4 feet 3 inches tall, 4 ounces\. /);
    assert.equal(measuresInUnits("20 centimetres tall, 300 grams.", "imperial"), "8 inches tall, 11 ounces.");
    assert.equal(measuresInUnits(quickFacts(sheet(4)), "metric"), quickFacts(sheet(4)));
  });

  it("pick a Pokédex sentence that stands on its own, with the name written normally", () => {
    for (const id of [92, 321]) {
      const line = shortDexLine(sheet(id));
      assert.doesNotMatch(line, /^Said\b/);
      assert.doesNotMatch(line, /WAILORD|GASTLY/);
    }
  });
});

describe("Pokédex text", () => {
  it("joins words the import split across a line", () => {
    assert.equal(cleanFlavor("may ac tually be its snores"), "may actually be its snores");
    assert.equal(cleanFlavor("seemingly translu cent wings"), "seemingly translucent wings");
    assert.equal(cleanFlavor("trans­\nlucent"), "translucent");
    assert.equal(cleanFlavor("the con test"), "the con test");
  });
});

describe("fact pieces", () => {
  const pieces = factParts({ quick: "Pikachu. The Mouse Pokémon.", reading: "Pikachu. It stores electricity.", seat: { dexId: 25 } });

  it("are the quick facts, then the tagged reading that can fall back to its older untagged recording", () => {
    assert.equal(pieces.length, 2);
    const [quick, reading] = pieces;
    assert.ok(quick && "text" in quick && reading && "text" in reading);
    assert.doesNotMatch(quick.text, /\{/);
    assert.match(reading.text, /\{/);
    assert.ok(reading.saved && !reading.saved.includes("{"));
  });

  it("are read in the send's voice, and a part the server would not know is never sent", () => {
    assert.ok(pieces.every((part) => "text" in part && part.voiceId === SEND_VOICE));
    const george = "JBFqnCBsd6RMkjVDRZzb";
    const voiced = withSendVoice(pieces, george);
    assert.ok(voiced.every((part) => "text" in part && part.voiceId === george));
    assert.ok(withSendVoice(pieces, PIPER_VOICE_ID).every((part) => "text" in part && part.voiceId === PIPER_VOICE_ID));
    const read = readTrackParts(voiced);
    assert.ok(read);
    const second = read[1];
    assert.ok(second && "text" in second);
    // The older script comes through the server's reader word for word.
    assert.equal(second.saved, (voiced[1] as { saved: string }).saved);
    assert.match(second.saved ?? "", /stores electricity/);
  });

  it("use an older recording of the reading instead of recording it again", async () => {
    const george = "JBFqnCBsd6RMkjVDRZzb";
    const voiced = withSendVoice(pieces, george);
    const saved = (voiced[1] as { saved: string }).saved;
    const recorded = new Set([`${george}\n${saved}`]);
    const used = await withSavedTakes(voiced, async (part) => recorded.has(`${part.voiceId}\n${part.text}`));
    assert.equal((used[1] as { text: string }).text, saved);
    // The quick facts have no older script, so they are recorded as written.
    assert.equal((used[0] as { text: string }).text, (voiced[0] as { text: string }).text);
    // A recording of the tagged reading wins over the older one.
    recorded.add(`${george}\n${(voiced[1] as { text: string }).text}`);
    const fresh = await withSavedTakes(voiced, async (part) => recorded.has(`${part.voiceId}\n${part.text}`));
    assert.equal((fresh[1] as { text: string }).text, (voiced[1] as { text: string }).text);
  });
});
