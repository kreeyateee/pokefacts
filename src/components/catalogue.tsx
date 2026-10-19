"use client";

import { useEffect, useState } from "react";

import type { BiologyBlock, BiologyView, CatalogueEntry, CataloguePage } from "@/lib/catalogue-types";
import type { KidCard } from "@/lib/kid-cards";
import {
  selectionPlaylist,
  selectionSpeciesLimit,
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
  Normal: "bg-[#a8a77a] text-[#1c1916]",
  Fire: "bg-[#ee8130] text-white",
  Water: "bg-[#6390f0] text-white",
  Electric: "bg-[#f7d02c] text-[#1c1916]",
  Grass: "bg-[#7ac74c] text-[#1c1916]",
  Ice: "bg-[#96d9d6] text-[#1c1916]",
  Fighting: "bg-[#c22e28] text-white",
  Poison: "bg-[#a33ea1] text-white",
  Ground: "bg-[#e2bf65] text-[#1c1916]",
  Flying: "bg-[#a98ff3] text-[#1c1916]",
  Psychic: "bg-[#f95587] text-white",
  Bug: "bg-[#a6b91a] text-[#1c1916]",
  Rock: "bg-[#b6a136] text-[#1c1916]",
  Ghost: "bg-[#735797] text-white",
  Dragon: "bg-[#6f35fc] text-white",
  Dark: "bg-[#705746] text-white",
  Steel: "bg-[#b7b7ce] text-[#1c1916]",
  Fairy: "bg-[#d685ad] text-[#1c1916]",
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
  return TYPE_CHIP[type] ?? "bg-[#efe8dc] text-[#1c1916]";
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

function spriteSrc(id: number): string {
  return `/sprites/${id}.png`;
}

function TypeChips({ types }: { types: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <span
          key={type}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${chipClass(type)}`}
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
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-b border-[#1c1916]/10 py-2 text-sm">
      <span className="text-[#8a5a22]">{label}</span>
      <span>{children}</span>
    </div>
  );
}

const PLAYLIST_KINDS: Array<{ id: SelectionKind; label: string; detail: string }> = [
  {
    id: "whos-that",
    label: "Who's That Pokémon",
    detail: "Cry, three clues, then the cry again and the name. Two tracks each, so 50 Pokémon fit.",
  },
  {
    id: "facts",
    label: "Facts",
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
}: {
  onSendSelection?: (card: KidCard) => Promise<void>;
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
  const [entryError, setEntryError] = useState("");
  const [biology, setBiology] = useState<BiologyView | null>(null);
  const [biologyFor, setBiologyFor] = useState(0);
  const [formNotes, setFormNotes] = useState<
    Array<{ formId: number; name: string; article: BiologyView }>
  >([]);
  const [showList, setShowList] = useState(true);
  const [picked, setPicked] = useState<number[]>([]);
  const [playlistKind, setPlaylistKind] = useState<SelectionKind>("facts");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [buildMessage, setBuildMessage] = useState("");
  const [building, setBuilding] = useState(false);

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
          if (error instanceof DOMException && error.name === "AbortError") return;
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
        if (!response.ok || !payload.entry) {
          throw new Error(payload.error || "That entry could not be opened.");
        }
        setEntry(payload.entry);
        setEntryError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEntryError(error instanceof Error ? error.message : "That entry could not be opened.");
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
        if (!response.ok || !payload.biology) {
          throw new Error(payload.error || "Biology could not be loaded.");
        }
        setBiology(payload.biology);
        setBiologyFor(selected);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
  const evolutionText = [
    entry?.evolvesFrom ? `Grows from ${entry.evolvesFrom.name}.` : "",
    ...(entry?.evolutions.map((evolution) =>
      evolution.method
        ? `Becomes ${evolution.name} ${evolution.method}.`
        : `Becomes ${evolution.name}.`,
    ) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const pageIds = list?.items.map((item) => item.id) ?? [];
  const pageAll = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const speciesLimit = selectionSpeciesLimit(playlistKind);

  function togglePick(id: number) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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
  }

  async function buildPlaylist() {
    if (picked.length === 0 || building) return;
    if (picked.length > speciesLimit) {
      setBuildMessage(
        playlistKind === "whos-that"
          ? `Who's That Pokémon uses two tracks for each Pokémon, so 50 fit on a card. ${picked.length} are picked. Nothing was sent.`
          : `A playlist holds 100 tracks. ${picked.length} are picked. Nothing was sent.`,
      );
      return;
    }
    setBuilding(true);
    setBuildMessage("");
    try {
      const rows: SelectionSpecies[] = [];
      for (let index = 0; index < picked.length; index += 1) {
        const id = picked[index];
        if (!id) continue;
        setBuildMessage(`Reading ${index + 1} of ${picked.length}…`);
        const entryResponse = await fetch(`/api/catalogue/${id}`);
        const entryPayload = (await entryResponse.json()) as { entry?: CatalogueEntry; error?: string };
        if (!entryResponse.ok || !entryPayload.entry) {
          throw new Error(entryPayload.error || "That entry could not be opened.");
        }
        const biologyResponse = await fetch(`/api/catalogue/${id}/biology`);
        const biologyPayload = (await biologyResponse.json()) as { biology?: { blocks?: BiologyBlock[] } };
        const entry = entryPayload.entry;
        rows.push({
          id: entry.id,
          name: entry.name,
          types: entry.types,
          genus: entry.genus,
          habitat: entry.habitat,
          heightLabel: entry.heightLabel,
          weightLabel: entry.weightLabel,
          abilities: entry.abilities.map((ability) => ({
            name: ability.name,
            info: ability.info,
            hidden: ability.hidden,
          })),
          evolvesFrom: entry.evolvesFrom?.name ?? null,
          evolutions: entry.evolutions.map((evolution) => ({ name: evolution.name, method: evolution.method })),
          info: entry.info,
          biology: biologyPayload.biology?.blocks ?? [],
        });
      }
      const built = selectionPlaylist(rows, playlistKind, playlistTitle);
      if (built.refused.length > 0) {
        setBuildMessage(
          `A playlist holds 100 tracks. ${built.refused.length} picked Pokémon did not fit, so nothing was sent.`,
        );
        return;
      }
      if (!onSendSelection) {
        setBuildMessage("Connect Yoto, then build the playlist again.");
        return;
      }
      setBuildMessage(`Sending ${built.title} to Yoto…`);
      await onSendSelection(built.card);
      setBuildMessage(`${built.title} is in your Yoto library.`);
    } catch (error: unknown) {
      setBuildMessage(error instanceof Error ? error.message : "The playlist was not sent.");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className={showList ? "block" : "hidden lg:block"}>
        <label className="grid gap-1 text-sm" htmlFor="catalogue-search">
          Search
          <input
            id="catalogue-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Name or number"
            className="h-11 rounded-xl border border-[#1c1916]/15 bg-white px-3"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setType("");
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              type === "" ? "bg-[#1c1916] text-[#f4efe6]" : "bg-white text-[#1c1916]"
            }`}
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
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                type === name ? "ring-2 ring-[#1c1916] ring-offset-2 ring-offset-[#f4efe6]" : ""
              } ${chipClass(name)}`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="mt-3 grid gap-1 text-sm" htmlFor="catalogue-region">
          Region
          <select
            id="catalogue-region"
            value={generation}
            onChange={(event) => {
              setGeneration(Number(event.target.value));
              setPage(1);
            }}
            className="h-10 rounded-xl border border-[#1c1916]/15 bg-white px-2"
          >
            <option value={0}>All regions</option>
            {REGIONS.map((region, index) => (
              <option key={region} value={index + 1}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 rounded-xl bg-white px-3 py-3">
          <p className="text-sm font-medium">
            {picked.length.toLocaleString("en-GB")} Pokémon picked
          </p>
          <p className="mt-1 text-xs leading-5 text-[#5c5348]">
            Playlist order is the order you tick them. Select all on this page checks only the list below.
          </p>
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
            className="mt-2 text-sm text-[#8a5a22] underline disabled:opacity-40"
            disabled={!list || list.total === 0}
            onClick={() => void selectMatches()}
          >
            Select all {list ? list.total.toLocaleString("en-GB") : ""} matches
          </button>
          <p className="mt-1 text-xs leading-5 text-[#8d8272]">
            That adds every species matching this search, type, and region.
          </p>
          {picked.length > 0 ? (
            <button
              type="button"
              className="mt-1 text-xs text-[#5c5348] underline"
              onClick={() => {
                setPicked([]);
                setBuildMessage("");
              }}
            >
              Clear the pick
            </button>
          ) : null}
          <fieldset className="mt-3 grid gap-2">
            <legend className="text-sm font-medium">Playlist type</legend>
            {PLAYLIST_KINDS.map((option) => (
              <label key={option.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 text-sm">
                <input
                  type="radio"
                  name="playlist-type"
                  className="mt-1"
                  checked={playlistKind === option.id}
                  onChange={() => {
                    setPlaylistKind(option.id);
                    setBuildMessage("");
                  }}
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#5c5348]">{option.detail}</span>
                </span>
              </label>
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
                  ? "Who's That Pokémon"
                  : playlistKind === "advanced"
                    ? "Advanced facts"
                    : "Facts"
              }
              className="h-10 rounded-xl border border-[#1c1916]/15 bg-[#f4efe6] px-3"
            />
          </label>
          <button
            type="button"
            className="mt-3 h-10 w-full rounded-full bg-[#1c1916] px-3 text-sm font-medium text-[#f4efe6] disabled:opacity-40"
            disabled={picked.length === 0 || building}
            onClick={() => void buildPlaylist()}
          >
            {building ? "Building playlist…" : "Build playlist from selection"}
          </button>
          {picked.length > speciesLimit ? (
            <p className="mt-2 text-xs leading-5 text-[#9f2d22]" role="alert">
              {playlistKind === "whos-that"
                ? `Who's That Pokémon uses two tracks each, so 50 is the limit. ${picked.length} are picked.`
                : `A playlist holds 100 tracks. ${picked.length} are picked.`}
            </p>
          ) : null}
          {buildMessage ? <p className="mt-2 text-xs leading-5 text-[#5c5348]">{buildMessage}</p> : null}
        </div>
        <p className="mt-3 text-xs text-[#8d8272]">
          {list
            ? `${list.total.toLocaleString("en-GB")} of ${list.species.toLocaleString("en-GB")} species`
            : "Opening the catalogue…"}
        </p>
        {listError ? (
          <p className="mt-3 text-sm text-[#9f2d22]" role="alert">
            {listError}
          </p>
        ) : null}
        <ul className="mt-2 grid max-h-[70vh] gap-1 overflow-auto pr-1">
          {loadingList && !list ? <li className="text-sm text-[#5c5348]">Loading entries…</li> : null}
          {list?.items.length === 0 ? (
            <li className="rounded-xl bg-white px-3 py-4 text-sm text-[#5c5348]">
              Nothing matches that search.
            </li>
          ) : null}
          {list?.items.map((item) => {
            const active = item.id === selected;
            return (
              <li key={item.id} className="flex items-stretch gap-1">
                <label className={`flex items-center rounded-xl px-2 ${active ? "bg-[#1c1916]" : "bg-white"}`}>
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
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
                    active ? "bg-[#1c1916] text-[#f4efe6]" : "bg-white text-[#1c1916]"
                  }`}
                >
                  <img
                    src={spriteSrc(item.id)}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
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
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-xs text-[#5c5348]">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1.5 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <article className={`rounded-2xl bg-white px-5 py-6 sm:px-8 sm:py-8 ${showList ? "hidden lg:block" : "block"}`}>
        <button
          type="button"
          className="mb-4 text-sm text-[#5c5348] underline lg:hidden"
          onClick={() => setShowList(true)}
        >
          Back to the list
        </button>
        {entryError ? (
          <p className="text-sm text-[#9f2d22]" role="alert">
            {entryError}
          </p>
        ) : null}
        {entry?.id !== selected && !entryError ? (
          <p className="text-sm text-[#5c5348]">Opening the entry…</p>
        ) : null}
        {entry && entry.id === selected ? (
          <>
            <p className="text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">
              {numberLabel(entry.id)} · {entry.region}
            </p>
            <div className="mt-3 flex items-end gap-4">
              <img
                src={spriteSrc(entry.id)}
                alt=""
                width={96}
                height={96}
                className="h-24 w-24 shrink-0 bg-[#f4efe6] object-contain [image-rendering:pixelated]"
              />
              <div>
                <h2 className="font-display text-4xl leading-tight sm:text-5xl">{entry.name}</h2>
                <p className="mt-1 text-sm text-[#5c5348]">The {entry.genus}</p>
                <div className="mt-2">
                  <TypeChips types={entry.types} />
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-prose text-base leading-7 text-[#2a241c]">{entry.info}</p>
            {entry.infoVersion ? (
              <p className="mt-2 text-xs text-[#8d8272]">Pokédex line from {entry.infoVersion}.</p>
            ) : null}
            {entry.notes ? (
              <>
                <h3 className="mt-6 text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">
                  Notes
                </h3>
                <p className="mt-2 max-w-prose text-sm leading-6 text-[#5c5348]">{entry.notes}</p>
              </>
            ) : null}
            <BiologyPanel biology={biologyFor === entry.id ? biology : null} />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <p className="rounded-xl bg-[#f4efe6] px-4 py-3 font-medium">It weighs {entry.weightLabel}.</p>
              <p className="rounded-xl bg-[#f4efe6] px-4 py-3 font-medium">It is {entry.heightLabel} tall.</p>
            </div>
            <div className="mt-4">
              <Fact label="Ability">{abilityText}</Fact>
              <Fact label="Evolution">{evolutionText || "It does not evolve."}</Fact>
              <Fact label="Habitat">{entry.habitat ? habitatLabel(entry.habitat) : "Not recorded"}</Fact>
              <Fact label="Gender">{entry.gender.replace(/\.$/, "")}</Fact>
              <Fact label="Egg groups">{entry.eggGroups.join(", ")}</Fact>
              <Fact label="Hatch">{entry.eggGroups.includes("No egg group") ? "No egg group" : `${entry.hatchCycles} egg cycles`}</Fact>
              <Fact label="Catch rate">{String(entry.captureRate)}</Fact>
              <Fact label="Growth">{entry.growth}</Fact>
            </div>
            <h3 className="mt-6 text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">Matchups</h3>
            <div className="mt-2 grid gap-3 text-sm">
              <MatchRow label="Weak" matches={entry.weak} empty="No extra weaknesses." />
              <MatchRow label="Resists" matches={entry.resist} empty="No resistances." />
              <MatchRow label="Immune" matches={entry.immune} empty="No immunities." />
            </div>
            <h3 className="mt-6 text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">Moves</h3>
            {entry.moves.length === 0 ? (
              <p className="mt-2 text-sm text-[#5c5348]">No moves are on file.</p>
            ) : (
              <ul className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                {entry.moves.map((move) => (
                  <li key={move} className="rounded-full bg-[#f4efe6] px-2 py-0.5 text-xs">
                    {move}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-6 text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">Base stats</h3>
            <ul className="mt-2 grid gap-1.5">
              {entry.stats.map((stat) => (
                <li key={stat.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                  <span>{stat.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#f4efe6]">
                    <span
                      className="block h-full rounded-full bg-[#8a5a22]"
                      style={{ width: `${Math.min(100, (stat.value / 255) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{stat.value}</span>
                </li>
              ))}
            </ul>
            {entry.forms.length > 0 ? (
              <>
                <h3 className="mt-6 text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase">
                  Other forms
                </h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {entry.forms.map((form) => (
                    <li key={form.id} className="rounded-xl bg-[#f4efe6] px-3 py-2 text-sm">
                      <p className="font-medium">{form.name}</p>
                      <div className="mt-1">
                        <TypeChips types={form.types} />
                      </div>
                      <p className="mt-1 text-[#5c5348]">
                        {form.heightLabel} · {form.weightLabel}
                      </p>
                      {formNotes
                        .filter((note) => note.formId === form.id && note.article.status === "ready")
                        .map((note) => (
                          <div key={note.formId} className="mt-2 text-[#2a241c]">
                            {note.article.blocks.map((block, index) =>
                              block.kind === "paragraph" ? (
                                <p key={index} className="mt-1 leading-6">
                                  {block.text}
                                </p>
                              ) : null,
                            )}
                            <p className="mt-2 text-xs leading-5 text-[#8d8272]">
                              From{" "}
                              <a className="underline" href={note.article.url} rel="noreferrer">
                                Bulbapedia
                              </a>
                              . This description is used under CC BY-NC-SA 2.5.
                            </p>
                          </div>
                        ))}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="h-10 rounded-full bg-[#f4efe6] px-4 text-sm disabled:opacity-40"
                disabled={entry.id <= 1}
                onClick={() => {
                  setSelected(entry.id - 1);
                  setShowList(false);
                }}
              >
                Previous number
              </button>
              <button
                type="button"
                className="h-10 rounded-full bg-[#f4efe6] px-4 text-sm disabled:opacity-40"
                disabled={!list || entry.id >= list.species}
                onClick={() => {
                  setSelected(entry.id + 1);
                  setShowList(false);
                }}
              >
                Next number
              </button>
            </div>
          </>
        ) : null}
      </article>
    </div>
  );
}

function BiologyPanel({ biology }: { biology: BiologyView | null }) {
  return (
    <section className="mt-6" aria-labelledby="biology-heading">
      <h3
        id="biology-heading"
        className="text-xs font-medium tracking-[0.14em] text-[#8a5a22] uppercase"
      >
        Biology
      </h3>
      {!biology ? <p className="mt-2 text-sm text-[#5c5348]">Opening the biology section…</p> : null}
      {biology?.status === "missing" ? (
        <p className="mt-2 text-sm text-[#5c5348]">No biology section</p>
      ) : null}
      {biology?.status === "unavailable" ? (
        <p className="mt-2 text-sm text-[#5c5348]">Biology could not be loaded.</p>
      ) : null}
      {biology?.status === "ready" ? (
        <>
          <p className="mt-2 text-xs leading-5 text-[#8d8272]">
            From <a className="underline" href={biology.url} rel="noreferrer">Bulbapedia</a>. This section is used under CC BY-NC-SA 2.5.
          </p>
          <div className="mt-3 max-w-prose">
            {biology.blocks.map((block, index) => {
              if (block.kind === "heading") {
                return (
                  <h4 key={index} className="mt-4 text-sm font-semibold text-[#1c1916]">
                    {block.text}
                  </h4>
                );
              }
              if (block.kind === "list") {
                return (
                  <ul key={index} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[#2a241c]">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={index} className="mt-2 text-sm leading-6 text-[#2a241c]">
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
      <span className="w-16 text-[#8a5a22]">{label}</span>
      {matches.length === 0 ? <span className="text-[#5c5348]">{empty}</span> : null}
      {matches.map((match) => (
        <span
          key={match.type}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${chipClass(match.type)}`}
        >
          {match.type} {multiplierLabel(match.multiplier)}
        </span>
      ))}
    </div>
  );
}
