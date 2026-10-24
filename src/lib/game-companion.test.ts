import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GET } from "../app/api/companion/[game]/route";
import { listBaseStats, listMonSheets } from "./catalogue-db";
import { companionGame, COMPANION_GAMES } from "./game-companion";
import { companionCards, countSpokenTracks, YOTO_TRACK_LIMIT } from "./kid-cards";

const sheets = listMonSheets();
const stats = listBaseStats();
const cardsFor = (id: string) => companionCards(companionGame(id), sheets, stats);
const trackFor = (id: string, name: string) =>
  cardsFor(id).flatMap((card) => card.chapters).find((chapter) => chapter.title === name)?.tracks[0]?.text ?? "";

describe("Game Companion cards", () => {
  it("cover each game's own Pokédex, in its order, each Pokémon once, in cards Yoto can hold", () => {
    assert.ok(COMPANION_GAMES.length >= 6);
    for (const game of COMPANION_GAMES) {
      const cards = cardsFor(game.id);
      const chapters = cards.flatMap((card) => card.chapters);
      assert.ok(chapters.length >= 150, `${game.short}: ${chapters.length}`);
      assert.equal(new Set(chapters.map((chapter) => chapter.dexId)).size, chapters.length, `${game.short} repeats a Pokémon`);
      for (const card of cards) assert.ok(countSpokenTracks(card.chapters) <= YOTO_TRACK_LIMIT, card.rangeLabel);
      assert.ok(chapters.every((chapter) => chapter.tracks[0]?.lead === "cry"), "each starts with the cry");
    }
    assert.match(trackFor("scarlet-violet", "Sprigatito"), /^Number 1 in the Paldea Pokédex\./);
  });

  it("say what it beats, what to watch out for, how it evolves, and what it's best at", () => {
    const fuecoco = trackFor("scarlet-violet", "Fuecoco");
    assert.match(fuecoco, /Fire type\. Its Fire moves are strong against Grass, Ice, Bug and Steel\./);
    assert.match(fuecoco, /Watch out for Water, Ground and Rock moves\./);
    assert.match(fuecoco, /Evolves into Crocalor at level 16\./);
    assert.match(fuecoco, /It's best at HP, and weakest at Speed\.$/);
    assert.match(trackFor("lets-go", "Gastly"), /Normal and Fighting moves can't touch it\./);
  });

  it("follow the game: its own evolution methods, and only Pokémon that are in it", () => {
    assert.match(trackFor("legends-arceus", "Machoke"), /Evolves into Machamp with a Linking Cord\./);
    assert.match(trackFor("legends-arceus", "Ursaring"), /Evolves into Ursaluna with a Peat Block\./);
    assert.match(trackFor("sword-shield", "Machoke"), /Evolves into Machamp when traded\./);
    // Let's Go is Kanto only, so Eevee's later evolutions are left out.
    const eevee = trackFor("lets-go", "Eevee");
    assert.match(eevee, /Evolves into Vaporeon with a Water Stone, Jolteon with a Thunder Stone or Flareon with a Fire Stone\./);
    assert.doesNotMatch(eevee, /Sylveon|Umbreon|more/);
  });

  it("serves one game's cards, and turns away a game that isn't on the list", async () => {
    const good = await GET(new Request("http://localhost/api/companion/lets-go"), { params: Promise.resolve({ game: "lets-go" }) });
    const payload = (await good.json()) as { cards: Array<{ kind: string }> };
    assert.ok(payload.cards.length >= 2);
    assert.ok(payload.cards.every((card) => card.kind === "companion"));
    const bad = await GET(new Request("http://localhost/api/companion/nope"), { params: Promise.resolve({ game: "nope" }) });
    assert.equal(bad.status, 404);
  });
});
