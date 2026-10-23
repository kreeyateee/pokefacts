import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { KidCard } from "./kid-cards";
import { readPendingSend, serializePendingSend, startPendingSend, type PendingPlaylist } from "./pending-send";
import {
  MAX_COVER_BYTES,
  SMALL_LIST,
  adventureCoverCard,
  adventureScene,
  autoCoverStyle,
  coverUploadRequest,
  lookScene,
  playlistCover,
  sceneForCard,
  sceneForLooks,
  type MonLook,
} from "./playlist-cover";
import { selectionPlaylist, selectionStickerCards, stickerCardId, type SelectionSpecies } from "./selection-playlist";
import { stickerCard } from "./sticker-cover";
import { freshCover } from "./sticker-layout";
import { cardPaintFor, picturesFor } from "./sticker-spec";
import type { StoryGraph } from "./story/story-graph";

function card(kind: KidCard["kind"], ids: number[], id = `${kind}-1`): KidCard {
  return {
    id,
    kind,
    title: "Test",
    rangeLabel: "Test card",
    libraryTitle: "Test card",
    blurb: "",
    childDoes: "",
    chapters: ids.map((dexId, index) => ({
      key: `c${dexId}`,
      title: `Mon ${dexId}`,
      overlay: String(index + 1),
      picture: "",
      mark: "",
      icon: "",
      dexId,
      tracks: [],
    })),
  };
}

function look(partial: Partial<MonLook> = {}): MonLook {
  return { habitat: null, types: ["Normal"], legendary: false, mythical: false, ...partial };
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

function saved(draft: Record<string, unknown>): string {
  return JSON.stringify(draft);
}

describe("playlist cover style", () => {
  it("gives one Pokémon the trading card, a short list the Pokédex, and a longer one the group photo", () => {
    assert.equal(autoCoverStyle(card("meet", [25])), "trading");
    assert.equal(autoCoverStyle(card("meet", [1, 4])), "pokedex");
    assert.equal(autoCoverStyle(card("meet", range(1, SMALL_LIST))), "pokedex");
    assert.equal(autoCoverStyle(card("meet", range(1, SMALL_LIST + 1))), "photo");
    assert.equal(autoCoverStyle(card("meet", range(1, 100))), "photo");
    assert.equal(autoCoverStyle(card("guess", range(1, 49))), "pokedex");
    assert.equal(autoCoverStyle(card("guess", [25])), "pokedex");
  });

  it("keeps adventures and empty cards on the group photo, with or without a partner", () => {
    assert.equal(autoCoverStyle(card("story", [])), "photo");
    assert.equal(autoCoverStyle(card("story", [25])), "photo");
    assert.equal(autoCoverStyle(card("meet", [])), "photo");
  });
});

describe("playlist cover scene", () => {
  it("puts legends and mythicals under the stars", () => {
    assert.equal(sceneForCard(card("legendary", [144, 145, 146]), []), "stars");
    assert.equal(sceneForCard(card("mythical", [151]), []), "stars");
    assert.equal(sceneForLooks([look({ legendary: true }), look({ mythical: true }), look()]), "stars");
  });

  it("puts a Water-heavy set by the sea", () => {
    const looks = [
      look({ types: ["Water"], habitat: "waters-edge" }),
      look({ types: ["Water", "Ice"], habitat: "sea" }),
      look({ types: ["Bug", "Water"] }),
      look({ types: ["Fire"], habitat: "mountain" }),
      look({ types: ["Grass"], habitat: "grassland" }),
    ];
    assert.equal(sceneForLooks(looks), "sea");
  });

  it("uses the place most of the set shares, by habitat or, for newer Pokémon, by type", () => {
    assert.equal(sceneForLooks([look({ habitat: "forest" }), look({ habitat: "forest" }), look({ habitat: "cave" })]), "forest");
    assert.equal(lookScene(look({ habitat: null, types: ["Ghost"] })), "cave");
    assert.equal(lookScene(look({ habitat: "urban", types: ["Ghost"] })), "city");
    assert.equal(lookScene(look({ habitat: null, types: [] })), "sky");
    assert.equal(sceneForLooks([look({ types: ["Rock"] }), look({ types: ["Ice"] }), look({ types: ["Steel"] })]), "mountain");
  });

  it("stands a mixed bag, or nothing known, on the blue sky", () => {
    const mixed = ["forest", "cave", "sea", "urban", "mountain", "grassland", "rough-terrain"].map((habitat) => look({ habitat }));
    assert.equal(sceneForLooks(mixed), "sky");
    assert.equal(sceneForLooks([]), "sky");
    assert.equal(sceneForCard(card("meet", range(1, 100)), []), "sky");
  });

  it("keeps riddles on a light sky so the silhouettes show, and starters on the grass", () => {
    assert.equal(sceneForCard(card("guess", [1, 2, 3, 4, 5]), [look({ legendary: true })]), "sky");
    assert.equal(sceneForCard(card("starter", [1, 4, 7, 152]), [look({ types: ["Water"] })]), "grassland");
  });

  it("gives each adventure its own place", () => {
    assert.equal(adventureScene("safari-1234"), "grassland");
    assert.equal(adventureScene("gym-77"), "city");
    assert.equal(adventureScene("island-5"), "sea");
    assert.equal(adventureScene("paldea-9"), "mountain");
    assert.equal(sceneForCard({ id: "gym-1", kind: "story" }, []), "city");
  });
});

describe("playlist cover choice", () => {
  const sea = [look({ types: ["Water"] }), look({ types: ["Water"] }), look({ types: ["Water"] }), look({ types: ["Water"] })];

  it("makes a cover for a card nobody designed, named after the playlist", () => {
    const facts = card("meet", [7, 8, 9, 54]);
    const result = playlistCover({ card: facts, saved: null, title: "Starter Pokémon 2", looks: sea });
    assert.equal(result.saved, false);
    assert.equal(result.cover.style, "photo");
    assert.equal(result.cover.scene, "sea");
    assert.equal(result.cover.title, "Starter Pokémon 2");
    assert.equal(result.cover.crowd, null);
    assert.equal(result.cover.painting, "");
  });

  it("gives a three-Pokémon pick the Pokédex with its first as the star", () => {
    const pick = card("meet", [25, 133, 39]);
    const { cover } = playlistCover({ card: pick, saved: null, title: "My picks", looks: [] });
    assert.equal(cover.style, "pokedex");
    assert.equal(cover.hero, "c25");
  });

  it("uses the child's saved design: their style, picks, drawing, and title", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    const painting = "data:image/png;base64,AAAA";
    const draft = saved({ style: "pile", crowd: ["c2", "c4"], hero: "c4", title: "Ava's grass gang", painting, scene: "forest", drawLayer: "front" });
    const result = playlistCover({ card: facts, saved: draft, title: "Pokefacts 1", looks: sea });
    assert.equal(result.saved, true);
    assert.equal(result.cover.style, "pile");
    assert.deepEqual(result.cover.crowd, ["c2", "c4"]);
    assert.equal(result.cover.hero, "c4");
    assert.equal(result.cover.title, "Ava's grass gang");
    assert.equal(result.cover.painting, painting);
    assert.equal(result.cover.scene, "forest");
    assert.deepEqual(
      picturesFor(facts, result.cover).map(([key]) => key),
      ["picture:/artwork/2.webp", "picture:/artwork/4.webp", painting],
    );
  });

  it("keeps a saved design's untouched title following the playlist's name", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    const draft = saved({ style: "trading", title: "Test card" });
    const result = playlistCover({ card: facts, saved: draft, title: "Test card 2", looks: [] });
    assert.equal(result.saved, true);
    assert.equal(result.cover.style, "trading");
    assert.equal(result.cover.title, "Test card 2");
  });

  it("keeps a saved design's own background choice, even the usual one", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    const result = playlistCover({ card: facts, saved: saved({ style: "photo" }), title: "Pokefacts 1", looks: sea });
    assert.equal(result.saved, true);
    assert.equal(result.cover.scene, null);
  });

  it("makes its own cover when the saved design is broken", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    for (const raw of ["{nope", "null", "42"]) {
      const result = playlistCover({ card: facts, saved: raw, title: "Pokefacts 1", looks: sea });
      assert.equal(result.saved, false);
      assert.equal(result.cover.scene, "sea");
    }
  });

  it("lets the send choose the background for the automatic cover only", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    assert.equal(playlistCover({ card: facts, saved: null, title: "T", looks: sea, scene: "city" }).cover.scene, "city");
    assert.equal(
      playlistCover({ card: facts, saved: saved({ scene: "cave" }), title: "T", looks: sea, scene: "city" }).cover.scene,
      "cave",
    );
  });
});

describe("Who's That covers", () => {
  const riddles = card("guess", range(1, 49));

  it("shows one silhouette on the Pokédex and keeps the star's name and types secret", () => {
    const { cover } = playlistCover({ card: riddles, saved: null, title: "Who's That 1", looks: [] });
    assert.equal(cover.style, "pokedex");
    const spec = cardPaintFor({
      card: riddles,
      cover,
      images: new Map(),
      sizes: {},
      heroes: { 1: { types: ["Grass", "Poison"], genus: "Seed Pokémon" } },
      fonts: { display: "serif", body: "serif" },
    });
    assert.equal(spec.hidden, true);
    assert.equal(spec.crowd.length, 49);
    assert.equal(spec.title, "Who's That 1");
    assert.equal(spec.hero?.info.hidden, true);
    assert.equal(spec.hero?.info.name, "Riddle 1");
    assert.deepEqual(spec.hero?.info.types, []);
  });

  it("stays secret in a saved trading card design too", () => {
    const { cover } = playlistCover({ card: riddles, saved: saved({ style: "trading", hero: "c7" }), title: "W", looks: [] });
    const spec = cardPaintFor({ card: riddles, cover, images: new Map(), sizes: {}, heroes: {}, fonts: { display: "a", body: "b" } });
    assert.equal(spec.style, "trading");
    assert.equal(spec.hero?.info.hidden, true);
  });
});

describe("adventure covers", () => {
  function story(id: string, text: string): StoryGraph {
    return {
      id,
      title: "Safari Zone Expert Challenge",
      description: "Catch them.",
      start: "start",
      nodes: [{ id: "start", kind: "ending", title: "Start", text, ending: { number: 1, name: "One" } }],
    };
  }

  it("brings the child's partner along only when the story does", () => {
    const along = adventureCoverCard(story("safari-1", "Pikachu waves. [cry:25]"), 25);
    assert.equal(along.kind, "story");
    assert.equal(along.libraryTitle, "Safari Zone Expert Challenge");
    assert.deepEqual(along.chapters.map((chapter) => chapter.dexId), [25]);
    assert.deepEqual(adventureCoverCard(story("safari-1", "Nobody comes along."), 25).chapters, []);
    assert.deepEqual(adventureCoverCard(story("safari-1", "[cry:25]")).chapters, []);
  });

  it("stands the adventure in its own place, as a group photo", () => {
    const cover = playlistCover({ card: adventureCoverCard(story("gym-3", "[cry:4]"), 4), saved: null, title: "Gym", looks: [] });
    assert.equal(cover.cover.style, "photo");
    assert.equal(cover.cover.scene, "city");
  });
});

describe("cover upload", () => {
  it("posts the drawn PNG as the body", () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
    const request = coverUploadRequest(png, 25);
    assert.equal(request?.path, "/api/yoto/cover");
    assert.equal(request?.init.method, "POST");
    assert.deepEqual(request?.init.headers, { "Content-Type": "image/png" });
    assert.equal(request?.init.body, png);
  });

  it("falls back to the bare artwork when drawing failed or the PNG is too big", () => {
    assert.deepEqual(coverUploadRequest(null, 25), { path: "/api/yoto/cover?id=25", init: { method: "POST" } });
    const huge = new Blob([new Uint8Array(MAX_COVER_BYTES + 1)], { type: "image/png" });
    assert.equal(coverUploadRequest(huge, 25)?.path, "/api/yoto/cover?id=25");
    assert.equal(coverUploadRequest(null), null);
    assert.equal(coverUploadRequest(new Blob([]), undefined), null);
  });
});

describe("cover card", () => {
  it("finds the sticker design saved for a picked playlist", () => {
    const picks = [
      { id: 25, name: "Pikachu" },
      { id: 10091, name: "Alolan Rattata", speciesId: 19 },
      { id: 133, name: "Eevee" },
    ];
    const stickers = selectionStickerCards(picks, "facts", "My picks");
    const species = picks.map(
      (pick): SelectionSpecies => ({
        id: pick.speciesId ?? pick.id,
        ...(pick.speciesId ? { formId: pick.id } : {}),
        name: pick.name,
        types: [],
        genus: "",
        habitat: null,
        heightLabel: "",
        weightLabel: "",
        abilities: [],
        evolvesFrom: null,
        evolutions: [],
        info: "",
        biology: [],
      }),
    );
    const sent = selectionPlaylist(species, "facts", "My picks").card;
    assert.equal(sent.id, "selection-facts");
    assert.equal(stickerCardId(sent), stickers[0]?.id);
    assert.equal(stickerCardId(card("meet", [1, 2], "meet-3")), "meet-3");
  });

  it("is kept with a send in progress, without the spoken text", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    facts.chapters[0]!.tracks.push({ key: "t", title: "T", text: "Long reading", icon: "", overlay: "" } as never);
    const coverCard = stickerCard(facts);
    assert.equal("tracks" in (coverCard.chapters[0] ?? {}), false);
    const current: PendingPlaylist = {
      playlistId: facts.id,
      libraryTitle: "Pokefacts 1",
      headline: "Pokefacts 1",
      rangeLabel: "1-5",
      coverCard,
      upload: { voiceId: "v", content: { title: "Pokefacts 1" } },
      jobs: [{ key: "a", title: "a", text: "a", progress: "a" }],
    };
    const send = startPendingSend({ title: "T", now: 1, voiceId: "v", mix: { cryVolume: 1, voiceVolume: 1, pauseSeconds: 0 }, current });
    assert.deepEqual(readPendingSend(serializePendingSend(send), 2)?.current?.coverCard, coverCard);
    const broken = serializePendingSend({ ...send, current: { ...current, coverCard: { id: 3 } as never } });
    assert.equal(readPendingSend(broken, 2), null);
  });

  it("starts a fresh design from the card the same way the sticker studio does", () => {
    const facts = card("meet", [1, 2, 3, 4, 5]);
    assert.equal(playlistCover({ card: facts, saved: null, title: "Test card", looks: [] }).cover.hero, freshCover({
      libraryTitle: "", rangeLabel: "", blurb: "", childDoes: "", detail: "", keys: ["c1"],
    }).hero);
  });
});
