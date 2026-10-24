import { monsFor, suggestedCover, type StickerCard } from "@/lib/sticker-cover";
import { readCoverDraft, type CoverDraft, type CoverStyle } from "@/lib/sticker-layout";
import type { Scene } from "@/lib/sticker-scenes";
import type { StoryGraph } from "@/lib/story/story-graph";

/**
 * The cover each playlist gets in the Yoto app is its sticker front, so the app matches the printed card.
 * A card the child designed in the sticker studio keeps their design. Every other card gets one made for
 * it: the group photo on a background that suits the set, or one big star for a short list.
 */

/** Where a Pokémon lives, its types, and how rare it is, as /api/catalogue?pick= returns them. */
export type MonLook = { habitat: string | null; types: string[]; legendary: boolean; mythical: boolean };

/** Yoto's cover art is card-shaped. The cover route takes a drawn PNG up to this size. */
export const MAX_COVER_BYTES = 3_000_000;

/** Up to this many Pokémon, the cover shows one star big instead of a small group photo. */
export const SMALL_LIST = 3;

/**
 * One Pokémon gets the trading card; two or three get the Pokédex with the first as its star. Riddles get
 * the Pokédex too, with one silhouette on its screen: a crowd of silhouettes runs together into one shadow.
 */
export function autoCoverStyle(card: Pick<StickerCard, "kind" | "chapters">): CoverStyle {
  if (card.kind === "story") return "photo";
  if (card.kind === "guess") return "pokedex";
  const count = monsFor(card).length;
  if (count === 1) return "trading";
  if (count > 1 && count <= SMALL_LIST) return "pokedex";
  return "photo";
}

/** The games' habitats, as the sticker backgrounds that show them. */
const HABITAT_SCENES: Readonly<Record<string, Scene>> = {
  grassland: "grassland",
  forest: "forest",
  "waters-edge": "lake",
  sea: "sea",
  cave: "cave",
  mountain: "mountain",
  "rough-terrain": "desert",
  urban: "city",
  rare: "stars",
};

/** Newer Pokémon have no habitat in the Pokédex, so their first type picks a place instead. */
const TYPE_SCENES: Readonly<Record<string, Scene>> = {
  water: "sea",
  grass: "forest",
  bug: "forest",
  normal: "grassland",
  fairy: "grassland",
  rock: "mountain",
  ice: "mountain",
  dragon: "mountain",
  ground: "desert",
  fire: "desert",
  steel: "city",
  electric: "city",
  fighting: "city",
  ghost: "cave",
  dark: "cave",
  poison: "cave",
  psychic: "sky",
  flying: "sky",
};

/** Where one Pokémon would stand: the stars for the rare ones, else its habitat, else its first type. */
export function lookScene(look: MonLook): Scene {
  if (look.legendary || look.mythical) return "stars";
  const home = look.habitat ? HABITAT_SCENES[look.habitat] : undefined;
  if (home) return home;
  return TYPE_SCENES[(look.types[0] ?? "").toLowerCase()] ?? "sky";
}

/** A place this share of the set agrees on wins. Anything more mixed stands on the classic blue sky. */
export const SCENE_SHARE = 0.4;

function isWater(look: MonLook): boolean {
  return look.types.some((type) => type.toLowerCase() === "water");
}

/** The background that suits a whole set: starry for legends, the sea for Water types, else the most shared place. */
export function sceneForLooks(looks: readonly MonLook[]): Scene {
  if (looks.length === 0) return "sky";
  const share = (count: number) => count / looks.length;
  if (share(looks.filter((look) => look.legendary || look.mythical).length) >= 0.5) return "stars";
  if (share(looks.filter(isWater).length) >= SCENE_SHARE) return "sea";
  const votes = new Map<Scene, number>();
  for (const look of looks) {
    const scene = lookScene(look);
    votes.set(scene, (votes.get(scene) ?? 0) + 1);
  }
  let best: Scene = "sky";
  let most = 0;
  for (const [scene, count] of votes) {
    if (count > most) {
      best = scene;
      most = count;
    }
  }
  return share(most) >= SCENE_SHARE ? best : "sky";
}

/** Each adventure's own place: the Safari Zone's grass, the Gym's city, the island's sea, Paldea's hills, the dungeon. */
export function adventureScene(storyId: string): Scene {
  if (storyId.startsWith("gym")) return "city";
  if (storyId.startsWith("island")) return "sea";
  if (storyId.startsWith("paldea")) return "mountain";
  if (storyId.startsWith("lost")) return "cave";
  return "grassland";
}

/** The background for a card's automatic cover. */
export function sceneForCard(card: Pick<StickerCard, "id" | "kind">, looks: readonly MonLook[]): Scene {
  if (card.kind === "story") return adventureScene(card.id);
  if (card.kind === "legendary" || card.kind === "mythical") return "stars";
  // Riddle silhouettes are nearly black, so they need a light sky behind them.
  if (card.kind === "guess") return "sky";
  if (card.kind === "starter") return "grassland";
  return sceneForLooks(looks);
}

/** The cover made for a card nobody designed: the style for its size, and a background that suits it. */
export function autoPlaylistCover(card: StickerCard, looks: readonly MonLook[], scene?: Scene): CoverDraft {
  return { ...suggestedCover(card), style: autoCoverStyle(card), scene: scene ?? sceneForCard(card, looks) };
}

/**
 * The cover for a playlist: the child's saved sticker design when this browser has one, else the automatic
 * cover. A title the child left as it was follows the playlist's own name, such as "Starter Pokémon 2".
 */
export function playlistCover(input: {
  card: StickerCard;
  /** The saved design from localStorage, or null. */
  saved: string | null;
  /** The playlist's name in the Yoto library. */
  title: string;
  looks: readonly MonLook[];
  /** A background chosen by the send, for the automatic cover. */
  scene?: Scene;
}): { cover: CoverDraft; saved: boolean } {
  const fresh = suggestedCover(input.card);
  const title = input.title.trim() || fresh.title;
  const read = readCoverDraft(input.saved, fresh, new Set(monsFor(input.card).map((mon) => mon.key)));
  if (read !== fresh) {
    const own = read.title.trim();
    return { cover: { ...read, title: own && own !== fresh.title ? read.title : title }, saved: true };
  }
  return { cover: { ...autoPlaylistCover(input.card, input.looks, input.scene), title }, saved: false };
}

/**
 * An adventure's cover card. Its Pokémon may be secrets the child works out, so only their partner comes
 * along, and only when the story brings them.
 */
export function adventureCoverCard(
  story: Pick<StoryGraph, "id" | "title" | "description" | "nodes">,
  partnerId?: number,
): StickerCard {
  const cry = partnerId ? `[cry:${partnerId}]` : "";
  const along = Boolean(partnerId) && story.nodes.some((node) => node.dexId === partnerId || node.text.includes(cry));
  return {
    id: story.id,
    kind: "story",
    rangeLabel: story.title,
    libraryTitle: story.title,
    blurb: story.description,
    childDoes: "",
    chapters: along && partnerId ? [{ key: "partner", title: "", overlay: "", dexId: partnerId }] : [],
  };
}

/** The request that uploads a cover: the PNG the page drew, or the bare artwork by number when drawing failed. */
export function coverUploadRequest(drawn: Blob | null, artworkId?: number): { path: string; init: RequestInit } | null {
  if (drawn && drawn.size > 0 && drawn.size <= MAX_COVER_BYTES) {
    return { path: "/api/yoto/cover", init: { method: "POST", headers: { "Content-Type": "image/png" }, body: drawn } };
  }
  if (artworkId) return { path: `/api/yoto/cover?id=${artworkId}`, init: { method: "POST" } };
  return null;
}
