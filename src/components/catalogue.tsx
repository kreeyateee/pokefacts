"use client";

import { useEffect, useState } from "react";

import { PlaylistWindow } from "@/components/playlist-window";
import { StatusBar } from "@/components/status-bar";
import { StickerStudio } from "@/components/sticker-studio";
import { EntryCard, EntryPager } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { MyoCardButton, openAfterDialog } from "@/components/myo-card-dialog";
import { useStoredState } from "@/components/use-stored-state";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { artworkSrc } from "@/lib/page-artwork";
import { artworkSrc as artworkApi } from "@/lib/artwork-path";
import { yotoPixelSrc } from "@/lib/yoto-screen";
import type {
  BiologyBlock,
  BiologyView,
  CatalogueEntry,
  CatalogueLineMember,
  CataloguePage,
} from "@/lib/catalogue-types";
import {
  CATALOGUE_PICKS_KEY,
  isFormPick,
  readCataloguePicks,
  serializeCataloguePicks,
} from "@/lib/catalogue-picks";
import { heightForUnits, weightForUnits, type MeasureUnits } from "@/lib/format";
import { statusWithDexNote } from "@/lib/spoken-wiki";
import type { KidCard } from "@/lib/kid-cards";
import {
  formSelection,
  selectionPlaylist,
  selectionSpeciesLimit,
  selectionStickerCards,
  speciesSelection,
  type SelectionKind,
  type SelectionSpecies,
} from "@/lib/selection-playlist";

const TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
] as const;

const TYPE_CHIP: Record<string, string> = {
  Normal: "bg-[#a8a77a] text-ink",
  Fire: "bg-[#ee8130] text-white",
  Water: "bg-[#6390f0] text-white",
  Electric: "bg-[#f7d02c] text-ink",
  Grass: "bg-[#7ac74c] text-ink",
  Ice: "bg-[#96d9d6] text-ink",
  Fighting: "bg-[#c22e28] text-white",
  Poison: "bg-[#a33ea1] text-white",
  Ground: "bg-[#e2bf65] text-ink",
  Flying: "bg-[#a98ff3] text-ink",
  Psychic: "bg-[#f95587] text-white",
  Bug: "bg-[#a6b91a] text-ink",
  Rock: "bg-[#b6a136] text-ink",
  Ghost: "bg-[#735797] text-white",
  Dragon: "bg-[#6f35fc] text-white",
  Dark: "bg-[#705746] text-white",
  Steel: "bg-[#b7b7ce] text-ink",
  Fairy: "bg-[#d685ad] text-ink",
};

const REGIONS = [
  "Kanto",
  "Johto",
  "Hoenn",
  "Sinnoh",
  "Unova",
  "Kalos",
  "Alola",
  "Galar",
  "Paldea",
];

function chipClass(type: string): string {
  return TYPE_CHIP[type] ?? "bg-[#efe8dc] text-ink";
}

function numberLabel(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

function habitatLabel(habitat: string): string {
  if (habitat === "waters-edge") return "water's edge";
  return habitat.replace(/-/g, " ");
}

function multiplierLabel(multiplier: number): string {
  if (multiplier === 0.5) return "×½";
  if (multiplier === 0.25) return "×¼";
  if (multiplier === 4) return "×4";
  return `×${multiplier}`;
}

function hideBrokenPicture(event: { currentTarget: HTMLImageElement }): void {
  const image = event.currentTarget;
  const fallback = image.dataset.fallback;
  if (fallback && image.dataset.tried !== "1" && image.getAttribute("src") !== fallback) {
    image.dataset.tried = "1";
    image.src = fallback;
    return;
  }
  image.style.display = "none";
}

function lineDetail(member: CatalogueLineMember): string {
  const method = member.method.trim();
  if (member.stage > 1) {
    return method ? `From ${member.fromName}, ${method}.` : `From ${member.fromName}.`;
  }
  if (!method) return "";
  return `${method.charAt(0).toUpperCase()}${method.slice(1)}.`;
}

function statFill(name: string): string {
  if (name === "HP") return "bg-[#3dce5a]";
  if (name === "Attack") return "bg-[#f08030]";
  if (name === "Defense") return "bg-[#ffcb05]";
  if (name === "Special Attack") return "bg-[#6890f0]";
  if (name === "Special Defense") return "bg-[#78c850]";
  return "bg-[#f85888]";
}

function TypeChips({ types }: { types: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <span
          key={type}
          className={`rounded-full border-2 border-[#16324f] px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${chipClass(type)}`}
        >
          {type}
        </span>
      ))}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-b border-ink/15 py-2 text-sm">
      <span className="font-bold text-poke-red">{label}</span>
      <span>{children}</span>
    </div>
  );
}

type EntryTab = "pokedex" | "bulbapedia" | "evolutions" | "battle" | "details" | "forms";

const PLAYLIST_KINDS: Array<{ id: SelectionKind; label: string; detail: string }> = [
  {
    id: "whos-that",
    label: "Who's That Pokémon Cards",
    detail: "Cry, three clues, then the cry again and the name. Two tracks each, so 50 Pokémon fit.",
  },
  {
    id: "facts",
    label: "Fact Cards",
    detail: "Cry, then the name and the first two biology paragraphs.",
  },
  {
    id: "advanced",
    label: "Advanced facts",
    detail: "Cry, then the name, biology, height, weight, type, ability, and evolution.",
  },
];

export function Catalogue({
  onSendSelection,
  onPrepareSend,
  onShowMyoCard,
  onBuildStart,
  units = "metric",
  job = null,
  sending = false,
}: {
  onSendSelection?: (card: KidCard) => Promise<void>;
  onPrepareSend?: (confirmLabel: string, newTitle: string, run: () => void | Promise<void>) => void;
  onShowMyoCard?: (title: string) => void;
  onBuildStart?: () => void;
  units?: MeasureUnits;
  job?: { status: string; detail: string; done?: number; total?: number } | null;
  sending?: boolean;
} = {}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [generation, setGeneration] = useState(0);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<CataloguePage | null>(null);
  const [listError, setListError] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(1);
  const [entry, setEntry] = useState<CatalogueEntry | null>(null);
  const [entryError, setEntryError] = useState<{ id: number; message: string } | null>(null);
  const [biology, setBiology] = useState<BiologyView | null>(null);
  const [biologyFor, setBiologyFor] = useState(0);
  const [formNotes, setFormNotes] = useState<
    Array<{ formId: number; name: string; article: BiologyView }>
  >([]);
  const [showList, setShowList] = useState(false);
  const [entryTab, setEntryTab] = useState<EntryTab>("pokedex");
  const [buildOpen, setBuildOpen] = useState(false);
  const [picks, setPicks] = useStoredState(CATALOGUE_PICKS_KEY, readCataloguePicks, serializeCataloguePicks);
  const { ids: picked, kind: playlistKind, title: playlistTitle } = picks;
  const setPicked = (next: number[] | ((current: number[]) => number[])) =>
    setPicks((current) => ({ ...current, ids: typeof next === "function" ? next(current.ids) : next }));
  const setPlaylistKind = (kind: SelectionKind) => setPicks((current) => ({ ...current, kind }));
  const setPlaylistTitle = (title: string) => setPicks((current) => ({ ...current, title }));
  const [buildMessage, setBuildMessage] = useState("");
  const [buildProgress, setBuildProgress] = useState<{ done: number; total: number } | null>(null);
  const [buildFailed, setBuildFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [stickerCards, setStickerCards] = useState<KidCard[] | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      if (generation) params.set("generation", String(generation));
      params.set("page", String(page));
      setLoadingList(true);
      void fetch(`/api/catalogue?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as CataloguePage & { error?: string };
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error(payload.error || "The catalogue could not be opened.");
          setList(payload);
          setListError("");
          setSelected((current) => {
            if (payload.items.length === 0) return current;
            if (payload.items.some((item) => item.id === current)) return current;
            if (page === 1) return payload.items[0]?.id ?? current;
            return current;
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setListError(error instanceof Error ? error.message : "The catalogue could not be opened.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingList(false);
        });
    }, 120);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [query, type, generation, page]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/catalogue/${selected}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { entry?: CatalogueEntry; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok || !payload.entry || payload.entry.id !== selected) {
          throw new Error(payload.error || "That entry could not be opened.");
        }
        setEntry(payload.entry);
        setEntryError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEntryError({
          id: selected,
          message: error instanceof Error ? error.message : "That entry could not be opened.",
        });
      });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    const controller = new AbortController();
    setBiology(null);
    setBiologyFor(0);
    void fetch(`/api/catalogue/${selected}/biology`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { biology?: BiologyView; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok || !payload.biology) {
          throw new Error(payload.error || "Biology could not be loaded.");
        }
        setBiology(payload.biology);
        setBiologyFor(selected);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setBiology({ status: "unavailable", url: "", blocks: [] });
        setBiologyFor(selected);
      });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    const controller = new AbortController();
    setFormNotes([]);
    void fetch(`/api/catalogue/${selected}/forms`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          forms?: Array<{ formId: number; name: string; article: BiologyView }>;
        };
        if (controller.signal.aborted) return;
        setFormNotes(payload.forms ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFormNotes([]);
      });
    return () => controller.abort();
  }, [selected]);

  const abilityText =
    entry?.abilities
      .map((ability) => {
        const name = ability.hidden ? `${ability.name} (hidden)` : ability.name;
        return ability.info ? `${name}. ${ability.info}` : name;
      })
      .join(" ") ?? "";
  const growsFrom = entry?.evolvesFrom ? `Grows from ${entry.evolvesFrom.name}.` : "";
  const lineMembers = [...(entry?.line.evolutions ?? []), ...(entry?.line.subevolutions ?? [])];
  const lineIds = lineMembers.map((member) => member.id);
  const lineAllPicked = lineIds.length > 0 && lineIds.every((id) => picked.includes(id));
  const evolutionText = lineMembers.length > 0 ? growsFrom : growsFrom || "It does not evolve.";
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const pageIds = list?.items.map((item) => item.id) ?? [];
  const pageAll = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const speciesLimit = selectionSpeciesLimit(playlistKind);
  const formCount = entry?.forms.length ?? 0;
  const formsPickedHere = entry?.forms.filter((form) => picked.includes(form.id)).length ?? 0;

  const entryTabs: Array<{ id: EntryTab; label: string }> = [
    { id: "pokedex", label: "Pokédex" },
    { id: "bulbapedia", label: "Bulbapedia" },
    ...(lineMembers.length > 0 ? [{ id: "evolutions" as const, label: "Evolutions" }] : []),
    { id: "battle", label: "Battle" },
    { id: "details", label: "Details" },
    ...(entry && entry.forms.length > 0 ? [{ id: "forms" as const, label: "Forms" }] : []),
  ];
  const shownTab: EntryTab = entryTabs.some((item) => item.id === entryTab) ? entryTab : "pokedex";

  function openEntry(id: number) {
    setSelected(id);
    setShowList(false);
  }

  /** Opens the Forms tab and brings it into view, so the form pictures are the next thing a child sees. */
  function showForms() {
    setEntryTab("forms");
    window.requestAnimationFrame(() => {
      document.getElementById("entry-tab-forms")?.scrollIntoView({ block: "start" });
    });
  }

  /** The name when it is on this page of the list, else the number. */
  function nameNear(id: number): string {
    return list?.items.find((item) => item.id === id)?.name ?? numberLabel(id);
  }

  function togglePick(id: number) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setBuildMessage("");
  }

  function toggleLine() {
    setPicked((current) => {
      if (lineAllPicked) return current.filter((id) => !lineIds.includes(id));
      const next = [...current];
      for (const id of lineIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
    setBuildMessage("");
  }

  function togglePage() {
    setPicked((current) => {
      if (pageAll) return current.filter((id) => !pageIds.includes(id));
      const next = [...current];
      for (const id of pageIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
    setBuildMessage("");
  }

  async function selectMatches() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    if (generation) params.set("generation", String(generation));
    params.set("ids", "1");
    try {
      const response = await fetch(`/api/catalogue?${params.toString()}`);
      const payload = (await response.json()) as { ids?: number[]; error?: string };
      if (!response.ok || !payload.ids) {
        setBuildMessage(payload.error || "Those matches could not be selected.");
        return;
      }
      setPicked((current) => {
        const next = [...current];
        for (const id of payload.ids ?? []) {
          if (!next.includes(id)) next.push(id);
        }
        return next;
      });
      setBuildMessage("");
    } catch (error: unknown) {
      setBuildMessage(error instanceof Error ? error.message : "Those matches could not be selected.");
    }
  }

  function pickTitle(): string {
    return (
      playlistTitle.trim() ||
      (playlistKind === "whos-that"
        ? "Who's That Pokémon Cards"
        : playlistKind === "advanced"
          ? "Advanced facts"
          : "Fact Cards")
    );
  }

  function showMyoCard() {
    if (!onShowMyoCard) return;
    setBuildOpen(false);
    setPlaylistOpen(false);
    openAfterDialog(() => onShowMyoCard(pickTitle()));
  }

  async function printStickers() {
    if (picked.length === 0 || stickerBusy || building) return;
    setStickerBusy(true);
    setBuildFailed(false);
    setBuildMessage("Preparing the stickers…");
    setBuildProgress(null);
    try {
      const response = await fetch(`/api/catalogue?pick=${picked.join(",")}`);
      const payload = (await response.json()) as {
        items?: Array<{ id: number; name: string; speciesId?: number }>;
        error?: string;
      };
      if (!response.ok || !payload.items) {
        throw new Error(payload.error || "Those Pokémon could not be opened.");
      }
      const cards = selectionStickerCards(payload.items, playlistKind, playlistTitle, units);
      if (cards.length === 0) throw new Error("Pick at least one Pokémon.");
      setStickerCards(cards);
      setBuildMessage("");
      setBuildOpen(false);
    } catch (error: unknown) {
      setBuildFailed(true);
      setBuildMessage(error instanceof Error ? error.message : "The stickers could not be prepared.");
    } finally {
      setStickerBusy(false);
    }
  }

  async function buildPlaylist() {
    if (picked.length === 0 || building) return;
    if (picked.length > speciesLimit) {
      setBuildFailed(true);
      setBuildProgress(null);
      setBuildMessage(
        playlistKind === "whos-that"
          ? `Who's That Pokémon Cards uses two tracks for each Pokémon, so 50 fit on a card. ${picked.length} are picked. Nothing was sent.`
          : `A playlist holds 100 tracks. ${picked.length} are picked. Nothing was sent.`,
      );
      return;
    }
    onBuildStart?.();
    setBuilding(true);
    setBuildFailed(false);
    setBuildMessage("");
    setBuildProgress({ done: 0, total: picked.length });
    try {
      const rows: SelectionSpecies[] = [];
      let dexNote = "";
      for (let index = 0; index < picked.length; index += 1) {
        const id = picked[index];
        if (!id) continue;
        setBuildProgress({ done: index + 1, total: picked.length });
        setBuildMessage(statusWithDexNote(`Reading ${index + 1} of ${picked.length}…`, dexNote));
        if (isFormPick(id)) {
          // A form reads through the same form route as the ready-made Mega and regional cards.
          const formResponse = await fetch(`/api/forms/${id}`);
          const formPayload = (await formResponse.json()) as {
            speciesId?: number;
            speech?: string;
            notice?: string;
            error?: string;
          };
          if (!formResponse.ok || !formPayload.speciesId) {
            throw new Error(formPayload.error || "That form could not be opened.");
          }
          if (playlistKind !== "whos-that" && formPayload.notice) dexNote = formPayload.notice;
          const speciesResponse = await fetch(`/api/catalogue/${formPayload.speciesId}`);
          const speciesPayload = (await speciesResponse.json()) as { entry?: CatalogueEntry; error?: string };
          const form = speciesPayload.entry ? formSelection(speciesPayload.entry, id, formPayload.speech ?? "") : null;
          if (!speciesResponse.ok || !form) {
            throw new Error(speciesPayload.error || "That form could not be opened.");
          }
          rows.push(form);
          continue;
        }
        const entryResponse = await fetch(`/api/catalogue/${id}`);
        const entryPayload = (await entryResponse.json()) as { entry?: CatalogueEntry; error?: string };
        if (!entryResponse.ok || !entryPayload.entry) {
          throw new Error(entryPayload.error || "That entry could not be opened.");
        }
        const biologyResponse = await fetch(`/api/catalogue/${id}/biology`);
        const biologyPayload = (await biologyResponse.json()) as {
          biology?: { blocks?: BiologyBlock[] };
          notice?: string;
        };
        if (playlistKind !== "whos-that" && biologyPayload.notice) dexNote = biologyPayload.notice;
        rows.push(speciesSelection(entryPayload.entry, biologyPayload.biology?.blocks ?? []));
      }
      const built = selectionPlaylist(rows, playlistKind, playlistTitle, units);
      if (built.refused.length > 0) {
        setBuildFailed(true);
        setBuildMessage(
          `A playlist holds 100 tracks. ${built.refused.length} picked Pokémon did not fit, so nothing was sent.`,
        );
        return;
      }
      if (!onSendSelection) {
        setBuildFailed(true);
        setBuildMessage("Connect Yoto, then build the playlist again.");
        return;
      }
      if (dexNote && built.card.kind !== "guess") {
        for (const chapter of built.card.chapters) {
          if (chapter.dexId) chapter.articleNotice = dexNote;
        }
      }
      setBuildMessage(statusWithDexNote(`Sending ${built.title} to Yoto…`, dexNote));
      setBuildProgress(null);
      await onSendSelection(built.card);
      setBuildProgress({ done: rows.length, total: rows.length });
      setBuildMessage(statusWithDexNote(`${built.title} is in your Yoto app. Link it to a blank card there.`, dexNote));
      setSentOk(true);
      setBuildOpen(true);
    } catch (error: unknown) {
      setBuildFailed(true);
      setBuildMessage(error instanceof Error ? error.message : "The playlist was not sent.");
    } finally {
      setBuilding(false);
    }
  }

  const sendJob = building && job && job.status !== "completed" ? job : null;
  const statusLabel = sendJob?.detail || buildMessage;
  const statusDone = sendJob ? sendJob.done : buildProgress?.done;
  const statusTotal = sendJob ? sendJob.total : buildProgress?.total;
  const statusFailed = sendJob ? sendJob.status === "failed" : buildFailed;
  const entryYoto = entry && entry.id === selected ? yotoPixelSrc({ dexId: entry.id }) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section
        className={`flex min-w-0 flex-col self-start max-lg:order-2 ${showList ? "" : "max-lg:hidden"}`}
      >
        <h2 className="order-1 pk-section-title">Find Pokémon</h2>
        <label className="order-1 mt-2 grid gap-1 text-sm" htmlFor="catalogue-search">
          Search
          <input
            id="catalogue-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Name or number"
            className="pk-field"
          />
        </label>
        <div className="pk-scroll order-1 mt-3 flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setType("");
              setPage(1);
            }}
            className="pk-pill shrink-0 px-3 text-xs"
            aria-pressed={type === ""}
          >
            All types
          </button>
          {TYPES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setType(name);
                setPage(1);
              }}
              className={`inline-flex min-h-11 items-center rounded-full border-2 border-[#16324f] px-3 text-xs font-bold ${
                type === name ? "ring-2 ring-white ring-offset-2 ring-offset-[#16324f]" : ""
              } ${chipClass(name)}`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="order-1 mt-3 grid gap-1 text-sm" htmlFor="catalogue-region">
          Region
          <select
            id="catalogue-region"
            value={generation}
            onChange={(event) => {
              setGeneration(Number(event.target.value));
              setPage(1);
            }}
            className="pk-field"
          >
            <option value={0}>All regions</option>
            {REGIONS.map((region, index) => (
              <option key={region} value={index + 1}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <div className="order-2 mt-3 flex flex-wrap items-center gap-2 lg:order-2">
          <p className="text-sm font-medium">
            {picked.length.toLocaleString("en-GB")} Pokémon picked
          </p>
          <Button type="button" className="h-11 px-4" onClick={() => setBuildOpen(true)}>
            Create card
          </Button>
          {onShowMyoCard ? <MyoCardButton onClick={showMyoCard} /> : null}
        </div>
        <Dialog open={buildOpen} onOpenChange={setBuildOpen}>
          <DialogContent className="overflow-hidden sm:max-w-xl" showCloseButton>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl leading-tight text-balance">Create card</DialogTitle>
              <DialogDescription>
                {sentOk
                  ? "This list is in your Yoto app. Link it to a blank card there. Paper stickers are optional next."
                  : "Tick Pokémon in the list, then send. The next step asks for the voice and where the list goes."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
          <p className="text-sm font-medium">
            {picked.length.toLocaleString("en-GB")} Pokémon picked
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Tick a Pokémon to add it at the end. Open the playlist to change the order.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11 w-full"
            onClick={() => setPlaylistOpen(true)}
          >
            Open playlist
          </Button>
          {onShowMyoCard ? <MyoCardButton className="mt-2 h-11 w-full" onClick={showMyoCard} /> : null}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pageAll}
              onChange={togglePage}
              disabled={pageIds.length === 0}
              aria-label="Select all on this page"
            />
            Select all on this page
          </label>
          <button
            type="button"
            className="mt-2 text-sm font-bold text-poke-red underline decoration-poke-yellow decoration-2 disabled:opacity-40"
            disabled={!list || list.total === 0}
            onClick={() => void selectMatches()}
          >
            Select all {list ? list.total.toLocaleString("en-GB") : ""} matches
          </button>
          <p className="mt-1 text-xs leading-5 pk-quiet">
            That adds every species matching this search, type, and region.
          </p>
          {picked.length > 0 ? (
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline"
              onClick={() => {
                setPicked([]);
                setBuildMessage("");
                setSentOk(false);
              }}
            >
              Clear the pick
            </button>
          ) : null}
          <fieldset className="mt-4 grid gap-2">
            <legend className="text-sm font-medium">Playlist type</legend>
            {PLAYLIST_KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pk-choice w-full px-3 py-2"
                aria-pressed={playlistKind === option.id}
                onClick={() => {
                  setPlaylistKind(option.id);
                  setBuildMessage("");
                  setSentOk(false);
                }}
              >
                <span className="block text-left text-sm font-bold">{option.label}</span>
                <span className="mt-0.5 block text-left text-xs leading-5 font-medium text-muted-foreground">
                  {option.detail}
                </span>
              </button>
            ))}
          </fieldset>
          <label className="mt-3 grid gap-1 text-sm" htmlFor="playlist-title">
            Title
            <input
              id="playlist-title"
              value={playlistTitle}
              onChange={(event) => setPlaylistTitle(event.target.value)}
              placeholder={
                playlistKind === "whos-that"
                  ? "Who's That Pokémon Cards"
                  : playlistKind === "advanced"
                    ? "Advanced facts"
                    : "Fact Cards"
              }
            className="pk-field"
          />
          </label>
          <Button
            type="button"
            className="mt-3 h-11 w-full"
            disabled={picked.length === 0 || building || sending}
            onClick={() => {
              setBuildOpen(false);
              openAfterDialog(() => onPrepareSend?.("Send this pick", pickTitle(), () => buildPlaylist()));
            }}
          >
            {building || sending ? "Recording in the background…" : "Send this pick"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-11 w-full"
            disabled={picked.length === 0 || stickerBusy}
            onClick={() => void printStickers()}
          >
            {stickerBusy ? "Getting stickers ready…" : "Make stickers"}
          </Button>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Stickers are paper covers for the Yoto card. You can make them before or after sending.
          </p>
          {picked.length > speciesLimit ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {`A Yoto card holds about ${speciesLimit} of this type. This pick needs ${Math.ceil(picked.length / speciesLimit)} cards.`}
            </p>
          ) : null}
          {statusLabel ? (
            <StatusBar
              label={statusLabel}
              done={statusDone}
              total={statusTotal}
              failed={statusFailed}
            />
          ) : null}
            </DialogBody>
          </DialogContent>
        </Dialog>
        <p className="order-2 mt-3 text-xs pk-quiet lg:order-3">
          {list
            ? `${list.total.toLocaleString("en-GB")} of ${list.species.toLocaleString("en-GB")} species`
            : "Opening the catalogue…"}
        </p>
        {listError ? (
          <p className="order-2 mt-3 text-sm pk-danger lg:order-3" role="alert">
            {listError}
          </p>
        ) : null}
        <ul className={`order-2 mt-2 grid max-h-[55dvh] gap-2 overflow-auto overscroll-y-contain pr-1 lg:order-3 lg:max-h-[70dvh] ${showList ? "" : "hidden lg:grid"}`}>
          {loadingList && !list ? <li className="text-sm text-muted-foreground">Loading entries…</li> : null}
          {list?.items.length === 0 ? (
            <li className="pk-card px-3 py-4 text-sm text-muted-foreground">
              Nothing matches that search.
            </li>
          ) : null}
          {list?.items.map((item) => {
            const active = item.id === selected;
            return (
              <li key={item.id} className="flex items-stretch gap-1">
                <label className={`flex min-h-12 min-w-12 items-center justify-center rounded-xl border-[3px] border-ink px-2 shadow-[2px_2px_0_var(--ink)] ${active ? "bg-poke-yellow" : "bg-white"}`}>
                  <input
                    type="checkbox"
                    checked={picked.includes(item.id)}
                    aria-label={`Pick ${item.name}`}
                    onChange={() => togglePick(item.id)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(item.id);
                    setShowList(false);
                  }}
                  aria-current={active ? "true" : undefined}
                  className="pk-choice flex w-full items-center gap-2 px-3 py-2"
                >
                  <img
                    src={artworkSrc(item.id)}
                    alt=""
                    width={44}
                    height={44}
                    data-fallback={artworkApi("species", item.id)}
                    onError={hideBrokenPicture}
                    className="pk-artwork-thumb"
                  />
                  <span className="min-w-0">
                    <span className="block">
                      <span className="mr-2 text-xs tabular-nums opacity-70">{numberLabel(item.id)}</span>
                      <span className="font-medium">{item.name}</span>
                    </span>
                    <span className="mt-1 hidden sm:block">
                      <TypeChips types={item.types} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className={`order-2 mt-3 flex items-center justify-between gap-2 text-sm lg:order-3 ${showList ? "" : "hidden lg:flex"}`}>
          <button
            type="button"
            className="pk-pill disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="pk-pill disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <div className={`min-w-0 self-start max-lg:order-1 ${showList ? "hidden lg:block" : "block"}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2 lg:hidden">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setShowList(true)}>
            Find Pokémon
          </Button>
          <Button type="button" className="h-11 px-4" onClick={() => setBuildOpen(true)}>
            Create card
          </Button>
          {onShowMyoCard ? <MyoCardButton onClick={showMyoCard} /> : null}
        </div>
        {entry && entry.id === selected ? (
          <EntryCard
            swapKey={entry.id}
            top={
              <EntryPager
                previous={entry.id > 1 ? nameNear(entry.id - 1) : undefined}
                next={list && entry.id < list.species ? nameNear(entry.id + 1) : undefined}
                position={numberLabel(entry.id)}
                onPrevious={() => openEntry(entry.id - 1)}
                onNext={() => openEntry(entry.id + 1)}
              />
            }
            onSwipe={(step) => {
              const id = entry.id + step;
              if (id >= 1 && (step < 0 || (list && id <= list.species))) openEntry(id);
            }}
            kicker={`${numberLabel(entry.id)} · ${entry.region}`}
            title={entry.name}
            meta={
              <div className="mt-2 grid justify-items-start gap-2">
                <p className="text-sm text-muted-foreground">The {entry.genus}</p>
                <TypeChips types={entry.types} />
                <label className="pk-pick mt-1">
                  <input
                    type="checkbox"
                    checked={picked.includes(entry.id)}
                    onChange={() => togglePick(entry.id)}
                  />
                  Add {entry.name} to the playlist
                </label>
                {formCount > 0 ? (
                  <button type="button" className="pk-pill inline-flex min-h-11 items-center px-4 text-sm" onClick={showForms}>
                    {formCount === 1 ? "Pick its other form" : `Pick from its ${formCount} other forms`}
                  </button>
                ) : null}
                {formsPickedHere > 0 ? (
                  <p className="text-xs font-bold">
                    {formsPickedHere === 1 ? "1 form is in the playlist." : `${formsPickedHere} forms are in the playlist.`}
                  </p>
                ) : null}
              </div>
            }
            picture={
              <img
                src={artworkSrc(entry.id)}
                alt=""
                width={192}
                height={192}
                className="pk-entry-art pk-entry-photo"
                data-fallback={artworkApi("species", entry.id)}
                onError={hideBrokenPicture}
              />
            }
            yotoSrc={entryYoto}
            tabs={
              <div
                className="pk-entry-tabs"
                role="tablist"
                aria-label={`About ${entry.name}`}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (!step) return;
                  event.preventDefault();
                  const index = entryTabs.findIndex((item) => item.id === shownTab);
                  const next = entryTabs[(index + step + entryTabs.length) % entryTabs.length];
                  setEntryTab(next.id);
                  document.getElementById(`entry-tab-${next.id}`)?.focus();
                }}
              >
                {entryTabs.map((item) => (
                  <button
                    key={item.id}
                    id={`entry-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={shownTab === item.id}
                    aria-controls="entry-panel"
                    tabIndex={shownTab === item.id ? 0 : -1}
                    className="pk-tab"
                    onClick={() => setEntryTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          >
            <div
              key={`${entry.id}-${shownTab}`}
              id="entry-panel"
              role="tabpanel"
              aria-labelledby={`entry-tab-${shownTab}`}
              tabIndex={0}
              className="pk-swap min-w-0"
            >
              {shownTab === "pokedex" ? (
                <div className="grid gap-3">
                  {entry.info ? (
                    <figure className="pk-dex-line">
                      <blockquote>{entry.info}</blockquote>
                      {entry.infoVersion ? <figcaption>Pokédex, {entry.infoVersion}</figcaption> : null}
                    </figure>
                  ) : (
                    <p className="text-sm text-muted-foreground">No Pokédex line is on file.</p>
                  )}
                  {entry.info2 ? (
                    <figure className="pk-dex-line">
                      <blockquote>{entry.info2}</blockquote>
                      {entry.info2Version ? <figcaption>Pokédex, {entry.info2Version}</figcaption> : null}
                    </figure>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="pk-soft px-4 py-3">It weighs {weightForUnits(entry.weightLabel, units)}.</p>
                    <p className="pk-soft px-4 py-3">It is {heightForUnits(entry.heightLabel, units)} tall.</p>
                  </div>
                  {entry.notes ? (
                    <>
                      <h3 className="mt-2 pk-kicker">Notes</h3>
                      <p className="max-w-prose text-sm leading-6 text-muted-foreground">{entry.notes}</p>
                    </>
                  ) : null}
                </div>
              ) : null}
              {shownTab === "bulbapedia" ? (
                <BiologyPanel biology={biologyFor === entry.id ? biology : null} />
              ) : null}
              {shownTab === "evolutions" ? (
                <section aria-label="Evolutions">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="pk-kicker">Evolutions</h3>
                    <button
                      type="button"
                      className="min-h-11 text-sm font-bold text-poke-red underline decoration-poke-yellow decoration-2"
                      onClick={toggleLine}
                    >
                      {lineAllPicked ? "Untick all evolutions" : "Tick all evolutions"}
                    </button>
                  </div>
                  <EvolutionPicks
                    members={entry.line.evolutions}
                    picked={picked}
                    onToggle={togglePick}
                    onOpen={openEntry}
                  />
                  {entry.line.subevolutions.length > 0 ? (
                    <>
                      <h3 className="mt-4 pk-kicker">Subevolutions</h3>
                      <EvolutionPicks
                        members={entry.line.subevolutions}
                        picked={picked}
                        onToggle={togglePick}
                        onOpen={openEntry}
                      />
                    </>
                  ) : null}
                </section>
              ) : null}
              {shownTab === "battle" ? (
                <>
                  <h3 className="pk-kicker">Matchups</h3>
                  <div className="mt-2 grid gap-3 text-sm">
                    <MatchRow label="Weak" matches={entry.weak} empty="No extra weaknesses." />
                    <MatchRow label="Resists" matches={entry.resist} empty="No resistances." />
                    <MatchRow label="Immune" matches={entry.immune} empty="No immunities." />
                  </div>
                  <h3 className="mt-6 pk-kicker">Base stats</h3>
                  <ul className="mt-2 grid gap-1.5">
                    {entry.stats.map((stat) => (
                      <li
                        key={stat.name}
                        className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm"
                      >
                        <span>{stat.name}</span>
                        <span className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white">
                          <span
                            className={`block h-full ${statFill(stat.name)}`}
                            style={{ width: `${Math.min(100, (stat.value / 255) * 100)}%` }}
                          />
                        </span>
                        <span className="text-right tabular-nums">{stat.value}</span>
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-6 pk-kicker">Moves</h3>
                  {entry.moves.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No moves are on file.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {entry.moves.map((move) => (
                        <li key={move} className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold">
                          {move}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
              {shownTab === "details" ? (
                <div>
                  <Fact label="Ability">{abilityText}</Fact>
                  <Fact label="Evolution">{evolutionText}</Fact>
                  <Fact label="Habitat">{entry.habitat ? habitatLabel(entry.habitat) : "Not recorded"}</Fact>
                  <Fact label="Gender">{entry.gender.replace(/\.$/, "")}</Fact>
                  <Fact label="Egg groups">{entry.eggGroups.join(", ")}</Fact>
                  <Fact label="Hatch">
                    {entry.eggGroups.includes("No egg group") ? "No egg group" : `${entry.hatchCycles} egg cycles`}
                  </Fact>
                  <Fact label="Catch rate">{String(entry.captureRate)}</Fact>
                  <Fact label="Growth">{entry.growth}</Fact>
                </div>
              ) : null}
              {shownTab === "forms" ? (
                <section aria-labelledby="forms-heading">
                  <h3 id="forms-heading" className="pk-kicker">
                    Pick a form
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tick a picture to add it to the playlist. Tick it again to take it off. You can pick {entry.name},
                    a form, or both.
                  </p>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    <li className="pk-soft px-3 py-3 text-sm font-normal">
                      <FormPick
                        name={entry.name}
                        src={artworkSrc(entry.id)}
                        fallback={artworkApi("species", entry.id)}
                        checked={picked.includes(entry.id)}
                        onToggle={() => togglePick(entry.id)}
                      />
                      <div className="mt-2">
                        <TypeChips types={entry.types} />
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {heightForUnits(entry.heightLabel, units)} · {weightForUnits(entry.weightLabel, units)}
                      </p>
                    </li>
                    {entry.forms.map((form) => (
                      <li key={form.id} className="pk-soft px-3 py-3 text-sm font-normal">
                        <FormPick
                          name={form.name}
                          src={artworkApi("form", form.id)}
                          checked={picked.includes(form.id)}
                          onToggle={() => togglePick(form.id)}
                        />
                        <div className="mt-2">
                          <TypeChips types={form.types} />
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {heightForUnits(form.heightLabel, units)} · {weightForUnits(form.weightLabel, units)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {formNotes.some((note) => note.article.status === "ready") ? (
                    <>
                      <h3 className="mt-6 pk-kicker">About the forms</h3>
                      {entry.forms.flatMap((form) =>
                        formNotes
                          .filter((note) => note.formId === form.id && note.article.status === "ready")
                          .map((note) => (
                            <div key={note.formId} className="mt-3 max-w-prose text-sm text-foreground">
                              <h4 className="font-semibold text-ink">{form.name}</h4>
                              {note.article.blocks.map((block, index) =>
                                block.kind === "paragraph" ? (
                                  <p key={index} className="mt-1 leading-6">
                                    {block.text}
                                  </p>
                                ) : null,
                              )}
                              <p className="mt-2 text-xs leading-5 pk-quiet">
                                From{" "}
                                <a className="underline" href={note.article.url} target="_blank" rel="noreferrer">
                                  Bulbapedia
                                </a>
                                . This description is used under CC BY-NC-SA 2.5.
                              </p>
                            </div>
                          )),
                      )}
                    </>
                  ) : null}
                </section>
              ) : null}
            </div>
          </EntryCard>
        ) : (
          <article className="pk-card pk-dex pk-entry-card">
            {entryError?.id === selected ? (
              <p className="text-sm pk-danger" role="alert">
                {entryError.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Opening the entry…</p>
            )}
          </article>
        )}
      </div>
      {stickerCards?.[0] ? (
        <StickerStudio
          key={stickerCards.map((item) => item.id).join("|")}
          card={stickerCards[0]}
          cards={stickerCards}
          onClose={() => setStickerCards(null)}
        />
      ) : null}
      <PlaylistWindow
        open={playlistOpen}
        onOpenChange={setPlaylistOpen}
        ids={picked}
        onChange={(next) => {
          setPicked(next);
          setBuildMessage("");
        }}
        onShowMyoCard={onShowMyoCard ? showMyoCard : undefined}
      />
    </div>
  );
}

function EvolutionPicks({
  members,
  picked,
  onToggle,
  onOpen,
}: {
  members: CatalogueLineMember[];
  picked: readonly number[];
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  if (members.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {members.map((member) => {
        const on = picked.includes(member.id);
        return (
          <li
            key={member.id}
            className={`flex items-center gap-2 rounded-xl border-[3px] border-ink px-2 py-2 shadow-[2px_2px_0_var(--ink)] ${
              on ? "bg-poke-yellow" : "bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              aria-label={`Pick ${member.name}`}
              onChange={() => onToggle(member.id)}
            />
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onOpen(member.id)}
            >
              <img
                src={artworkSrc(member.id)}
                alt=""
                width={48}
                height={48}
                className="pk-artwork-thumb"
              />
              <span className="min-w-0">
                <span className="block">
                  <span className="mr-2 text-xs tabular-nums opacity-70">{numberLabel(member.id)}</span>
                  <span className="font-medium">{member.name}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{lineDetail(member)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One big tick for a Pokémon or one of its forms: the picture and the name.
 * The whole tile is the tick box, so a tap anywhere on it adds or removes it.
 */
function FormPick({
  name,
  src,
  fallback,
  checked,
  onToggle,
}: {
  name: string;
  src: string;
  /** Species art only. A form picture never swaps to the base species. */
  fallback?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="pk-pick pk-form-pick">
      <input type="checkbox" checked={checked} aria-label={`Pick ${name}`} onChange={onToggle} />
      <img
        src={src}
        alt=""
        width={88}
        height={88}
        data-fallback={fallback}
        onError={hideBrokenPicture}
        className="pk-form-pick-art"
      />
      <span className="min-w-0">
        <span className="block text-base leading-tight">{name}</span>
        <span className="mt-1 block text-xs font-bold text-muted-foreground">
          {checked ? "In the playlist" : "Not picked"}
        </span>
      </span>
    </label>
  );
}

function BiologyPanel({ biology }: { biology: BiologyView | null }) {
  return (
    <section aria-labelledby="biology-heading">
      <h3
        id="biology-heading"
        className="pk-kicker"
      >
        Biology
      </h3>
      {!biology ? <p className="mt-2 text-sm text-muted-foreground">Opening the biology section…</p> : null}
      {biology?.status === "missing" ? (
        <p className="mt-2 text-sm text-muted-foreground">No biology section</p>
      ) : null}
      {biology?.status === "unavailable" ? (
        <p className="mt-2 text-sm text-muted-foreground">Biology could not be loaded.</p>
      ) : null}
      {biology?.status === "ready" ? (
        <>
          <p className="mt-2 text-xs leading-5 pk-quiet">
            From <a className="underline" href={biology.url} target="_blank" rel="noreferrer">Bulbapedia</a>. This section is used under CC BY-NC-SA 2.5.
          </p>
          <div className="mt-3 max-w-prose">
            {biology.blocks.map((block, index) => {
              if (block.kind === "heading") {
                return (
                  <h4 key={index} className="mt-4 text-sm font-semibold text-ink">
                    {block.text}
                  </h4>
                );
              }
              if (block.kind === "list") {
                return (
                  <ul key={index} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={index} className="mt-2 text-sm leading-6 text-foreground">
                  {block.text}
                </p>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

function MatchRow({
  label,
  matches,
  empty,
}: {
  label: string;
  matches: Array<{ type: string; multiplier: number }>;
  empty: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 font-bold text-poke-red">{label}</span>
      {matches.length === 0 ? <span className="text-muted-foreground">{empty}</span> : null}
      {matches.map((match) => (
        <span
          key={match.type}
          className={`rounded-full border-2 border-[#16324f] px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${chipClass(match.type)}`}
        >
          {match.type} {multiplierLabel(match.multiplier)}
        </span>
      ))}
    </div>
  );
}
