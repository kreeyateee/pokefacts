import type { KidCardKind } from "@/lib/kid-cards";

export type StudioView = "cards" | "catalogue" | "setup" | "music" | "adventures" | "printables";

/** Top of the menu: ready-made playlists, the Pokédex builder, Adventures, Printables, then Music. */
export type SectionId = "ready" | "own" | "adventures" | "printables" | "music";

export type CollectionKind = Extract<
  KidCardKind,
  "companion" | "starter" | "joke" | "mega" | "gmax" | "alola" | "hisui" | "legendary" | "mythical"
>;

/** "quick" is the Facts playlists read short, Quick Pokefacts. Its cards are the Facts cards. */
export type ReadyKind = "meet" | "quick" | "guess" | CollectionKind;

export const SECTIONS: ReadonlyArray<{
  id: SectionId;
  label: string;
}> = [
  { id: "ready", label: "Ready-made" },
  { id: "own", label: "Make your own" },
  { id: "adventures", label: "Adventures" },
  { id: "printables", label: "Printables" },
  { id: "music", label: "Music" },
];

export const COLLECTION_TABS: ReadonlyArray<{
  kind: CollectionKind;
  label: string;
  title: string;
}> = [
  { kind: "companion", label: "Game Companion", title: "Game Companion" },
  { kind: "starter", label: "Starters", title: "Starter Pokémon" },
  { kind: "joke", label: "Jokes", title: "Pokémon Joke Book" },
  { kind: "mega", label: "Mega", title: "Mega Evolutions" },
  { kind: "gmax", label: "Gigantamax", title: "Gigantamax" },
  { kind: "alola", label: "Alolan", title: "Alolan forms" },
  { kind: "hisui", label: "Hisuian", title: "Hisuian forms" },
  { kind: "legendary", label: "Legendary", title: "Legendary Pokémon" },
  { kind: "mythical", label: "Mythical", title: "Mythical Pokémon" },
];

/** The ready-made shelf. Every set sits side by side, then its playlists. */
export const READY_CATEGORIES: ReadonlyArray<{
  kind: ReadyKind;
  label: string;
}> = [
  { kind: "meet", label: "Facts" },
  { kind: "quick", label: "Quick Pokefacts" },
  { kind: "guess", label: "Who's That" },
  ...COLLECTION_TABS.map((tab) => ({ kind: tab.kind, label: tab.label })),
];

export function isCollectionKind(kind: KidCardKind): kind is CollectionKind {
  return COLLECTION_TABS.some((tab) => tab.kind === kind);
}

export function isReadyKind(kind: string): kind is ReadyKind {
  return READY_CATEGORIES.some((item) => item.kind === kind);
}

/** The open tab is kept per browser tab so a Yoto login redirect or a refresh comes back to it. */
export const SAVED_TAB_KEY = "pokefacts.tab";

export type SavedTab = { view: StudioView; kind: KidCardKind | ReadyKind };

const STUDIO_VIEWS: readonly StudioView[] = ["cards", "catalogue", "setup", "music", "adventures", "printables"];

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
  const kind = typeof row.kind === "string" ? row.kind : "";
  return { view: row.view as StudioView, kind: isReadyKind(kind) ? kind : "meet" };
}

export function sectionFor(view: StudioView): SectionId | null {
  if (view === "catalogue") return "own";
  if (view === "music") return "music";
  if (view === "adventures") return "adventures";
  if (view === "printables") return "printables";
  if (view === "setup") return null;
  return "ready";
}

export function viewForSection(section: Exclude<SectionId, "ready">): StudioView {
  if (section === "own") return "catalogue";
  return section;
}

export function pageHeading(input: {
  view: StudioView;
  kind: KidCardKind | ReadyKind;
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
      title: "Make your own",
      blurb: "Pick any Pokémon from the Pokédex, send your own playlist, then print stickers if you want.",
    };
  }
  if (input.view === "music") {
    return {
      title: "Music",
      blurb: "Play songs from the games as YouTube videos.",
    };
  }
  if (input.view === "printables") {
    return {
      title: "Printables",
      blurb: "Stickers for your Yoto cards and big A4 posters, ready to print at home.",
    };
  }
  if (input.view === "adventures") {
    return {
      title: "Adventures",
      blurb: "Choose-your-own-adventure cards. Try one here, then send it to Yoto.",
    };
  }
  if (input.kind === "quick") {
    return {
      title: "Quick Pokefacts",
      blurb: "Short fact playlists: each Pokémon's cry, then its quick facts. Hear one, then send the list to Yoto.",
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
      blurb:
        input.kind === "companion"
          ? "For the game your child is playing: each Pokémon's number in that game, what it beats, what to watch out for, and how it evolves there."
          : input.kind === "starter"
          ? "Every region's starter Pokémon, all three steps of each. Hear one, then send the set to Yoto."
          : input.kind === "joke"
            ? "Fifty Pokémon jokes, each with the Pokémon's cry. Hear one, then send the book to Yoto."
            : "Special forms and legendaries. Hear one, then send the set to Yoto.",
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
