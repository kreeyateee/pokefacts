import type { KidCardKind } from "@/lib/kid-cards";

export type StudioView = "cards" | "catalogue" | "setup" | "music" | "adventures";

export type PrimaryTabId = "facts" | "guess" | "collections" | "catalogue" | "music" | "adventures";

export type CollectionKind = Extract<
  KidCardKind,
  "mega" | "gmax" | "alola" | "hisui" | "legendary" | "mythical"
>;

export const PRIMARY_TABS: ReadonlyArray<{
  id: PrimaryTabId;
  label: string;
}> = [
  { id: "facts", label: "Fact Cards" },
  { id: "guess", label: "Who's That" },
  { id: "collections", label: "Collection Cards" },
  { id: "catalogue", label: "Pokédex Cards" },
  { id: "music", label: "Music" },
  { id: "adventures", label: "Adventures" },
];

export const COLLECTION_TABS: ReadonlyArray<{
  kind: CollectionKind;
  label: string;
  title: string;
}> = [
  { kind: "mega", label: "Mega", title: "Mega Evolutions" },
  { kind: "gmax", label: "Gigantamax", title: "Gigantamax" },
  { kind: "alola", label: "Alolan", title: "Alolan forms" },
  { kind: "hisui", label: "Hisuian", title: "Hisuian forms" },
  { kind: "legendary", label: "Legendary", title: "Legendary Pokémon" },
  { kind: "mythical", label: "Mythical", title: "Mythical Pokémon" },
];

export const DEFAULT_COLLECTION: CollectionKind = "mega";

export function isCollectionKind(kind: KidCardKind): kind is CollectionKind {
  return COLLECTION_TABS.some((tab) => tab.kind === kind);
}

/** The open tab is kept per browser tab so a Yoto login redirect or a refresh comes back to it. */
export const SAVED_TAB_KEY = "pokefacts.tab";

export type SavedTab = { view: StudioView; kind: KidCardKind };

const STUDIO_VIEWS: readonly StudioView[] = ["cards", "catalogue", "setup", "music", "adventures"];

export function readSavedTab(raw: string | null): SavedTab | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as { view?: unknown; kind?: unknown };
  if (!STUDIO_VIEWS.includes(row.view as StudioView)) return null;
  const kind = row.kind as KidCardKind;
  const knownKind = kind === "meet" || kind === "guess" || isCollectionKind(kind);
  return { view: row.view as StudioView, kind: knownKind ? kind : "meet" };
}

export function primaryTabFor(view: StudioView, kind: KidCardKind): PrimaryTabId | null {
  if (view === "catalogue") return "catalogue";
  if (view === "music") return "music";
  if (view === "adventures") return "adventures";
  if (view === "setup") return null;
  if (kind === "guess") return "guess";
  if (isCollectionKind(kind)) return "collections";
  return "facts";
}

export function pageHeading(input: {
  view: StudioView;
  kind: KidCardKind;
  libraryTitle?: string;
  randomFacts?: boolean;
}): { title: string; blurb: string } {
  if (input.view === "setup") {
    return {
      title: "How to connect Yoto",
      blurb: "A grown-up signs in once, sends a playlist, then links it to a blank card in the Yoto app.",
    };
  }
  if (input.view === "catalogue") {
    return {
      title: "Pokédex Cards",
      blurb: "Build your own list. Tick Pokémon, send the playlist, then print stickers if you want.",
    };
  }
  if (input.view === "music") {
    return {
      title: "Music",
      blurb: "Play songs from the games as YouTube videos.",
    };
  }
  if (input.view === "adventures") {
    return {
      title: "Adventures",
      blurb: "Choose-your-own-adventure cards. Try one here, then send it to Yoto.",
    };
  }
  if (input.kind === "guess") {
    return {
      title: "Who's That Pokémon Cards",
      blurb: "Guessing-game cards. Hear the cry and clues, then send the list to Yoto.",
    };
  }
  if (isCollectionKind(input.kind)) {
    const tab = COLLECTION_TABS.find((item) => item.kind === input.kind);
    return {
      title: input.libraryTitle || tab?.title || "Collection Cards",
      blurb: "Special forms and legendaries. Hear one, then send the set to Yoto.",
    };
  }
  return {
    title: "Fact Cards",
    blurb: input.randomFacts
      ? "A ready-made list of 100 Pokémon. Hear one, then send the whole list to Yoto."
      : "Ready-made fact playlists. Hear a short fact, then send the list to Yoto.",
  };
}

export function playlistNote(input: {
  randomGuess: boolean;
  randomFacts: boolean;
  splitSet: boolean;
  formMode: boolean;
  speciesSet: boolean;
  rangeLabel: string;
  libraryTitle: string;
  blurb: string;
}): string {
  if (input.randomGuess) return "These 50 riddles. Shuffle draws a new fifty. Send uses this list.";
  if (input.randomFacts) return "These 100 Pokémon. Shuffle draws a new hundred. Send uses this list.";
  if (input.splitSet) return `${input.rangeLabel}. ${input.blurb}`;
  if (input.formMode) return `${input.libraryTitle}. One track for each form.`;
  if (input.speciesSet) return `${input.libraryTitle}. One track for each Pokémon.`;
  return `${input.rangeLabel}. One part of the full Pokefacts set.`;
}
