import { cacheLife } from "next/cache";

import { describeChain, type EvolutionNode } from "@/lib/evolution";
import {
  catchSpeech,
  cleanFlavor,
  growthSpeech,
  habitatSpeech,
  heightSpeech,
  statSpeech,
  titleCaseName,
  versionName,
  versionRank,
  weightSpeech,
} from "@/lib/format";
import type { AbilityNote, DexEntry, Dossier, FlavorNote } from "@/lib/types";

const POKE = "https://pokeapi.co/api/v2";

type Named = { name: string; url: string };

type PokemonPayload = {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: Array<{ slot: number; type: Named }>;
  abilities: Array<{
    is_hidden: boolean;
    ability: Named;
  }>;
  stats: Array<{ base_stat: number; stat: Named }>;
  species: Named;
  cries?: { latest?: string | null };
};

type SpeciesPayload = {
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  capture_rate: number;
  growth_rate: Named | null;
  habitat: Named | null;
  generation: Named;
  genera: Array<{ genus: string; language: Named }>;
  flavor_text_entries: Array<{
    flavor_text: string;
    language: Named;
    version: Named;
  }>;
  evolution_chain: { url: string };
};

type AbilityPayload = {
  name: string;
  effect_entries: Array<{
    short_effect: string;
    effect: string;
    language: Named;
  }>;
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "champdex/0.1" },
  });
  if (!response.ok) {
    throw new Error(`PokéAPI returned ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function idFromPokemonUrl(url: string): number {
  const match = url.match(/\/pokemon\/(\d+)\/?$/);
  return match ? Number(match[1]) : 0;
}

const REGIONS: Record<string, string> = {
  "generation-i": "Kanto",
  "generation-ii": "Johto",
  "generation-iii": "Hoenn",
  "generation-iv": "Sinnoh",
  "generation-v": "Unova",
  "generation-vi": "Kalos",
  "generation-vii": "Alola",
  "generation-viii": "Galar",
  "generation-ix": "Paldea",
};

function pickFlavor(species: SpeciesPayload): FlavorNote[] {
  const english = species.flavor_text_entries
    .filter((entry) => entry.language.name === "en")
    .map((entry) => ({
      text: cleanFlavor(entry.flavor_text),
      version: versionName(entry.version.name),
      rank: versionRank(entry.version.name),
    }))
    .filter((entry) => entry.text.length > 0);

  const unique = new Map<string, (typeof english)[number]>();
  for (const entry of english) {
    const existing = unique.get(entry.text);
    if (!existing || entry.rank > existing.rank) unique.set(entry.text, entry);
  }
  const notes = [...unique.values()].sort((a, b) => b.rank - a.rank);
  const lead = notes[0];
  const classic = [...notes].sort((a, b) => a.rank - b.rank)[0];
  if (!lead) return [];
  if (!classic || classic.text === lead.text) {
    return [{ text: lead.text, version: lead.version }];
  }
  return [
    { text: lead.text, version: lead.version },
    { text: classic.text, version: classic.version },
  ];
}

function abilityEffect(ability: AbilityPayload): string {
  const english = ability.effect_entries.find(
    (entry) => entry.language.name === "en",
  );
  const raw = english?.short_effect || english?.effect || "";
  const cleaned = raw
    .replace(/\$effect_chance/g, "the listed")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 280) return cleaned;
  const cut = cleaned.slice(0, 277);
  const stop = cut.lastIndexOf(".");
  return `${(stop > 80 ? cut.slice(0, stop + 1) : cut).trim()}`;
}

export async function getNationalDex(): Promise<DexEntry[]> {
  "use cache";
  cacheLife("hours");
  const payload = await readJson<{ results: Named[] }>(
    `${POKE}/pokemon?limit=1025&offset=0`,
  );
  return payload.results
    .map((entry) => {
      const id = idFromPokemonUrl(entry.url);
      return { id, slug: entry.name, name: titleCaseName(entry.name) };
    })
    .filter((entry) => entry.id >= 1 && entry.id <= 1025);
}

export async function getDossier(id: number): Promise<Dossier> {
  "use cache";
  cacheLife("hours");
  if (!Number.isInteger(id) || id < 1 || id > 1025) {
    throw new Error("That national number is outside the field guide.");
  }

  const pokemon = await readJson<PokemonPayload>(`${POKE}/pokemon/${id}`);
  const species = await readJson<SpeciesPayload>(pokemon.species.url);
  const [chain, ...abilityPayloads] = await Promise.all([
    readJson<{ chain: EvolutionNode }>(species.evolution_chain.url),
    ...pokemon.abilities.map((ability) =>
      readJson<AbilityPayload>(ability.ability.url),
    ),
  ]);

  const abilities: AbilityNote[] = pokemon.abilities.map((ability, index) => ({
    name: titleCaseName(ability.ability.name),
    hidden: ability.is_hidden,
    effect: abilityEffect(
      abilityPayloads[index] ?? { name: ability.ability.name, effect_entries: [] },
    ),
  }));

  const stats = pokemon.stats.map((stat) => ({
    slug: stat.stat.name,
    name: statSpeech(stat.stat.name),
    value: stat.base_stat,
  }));

  const genus =
    species.genera.find((entry) => entry.language.name === "en")?.genus ??
    "Pokémon";

  return {
    id: pokemon.id,
    slug: pokemon.name,
    name: titleCaseName(pokemon.name),
    genus: genus.replace(/POK[eé]MON/gi, "Pokémon"),
    types: [...pokemon.types]
      .sort((a, b) => a.slot - b.slot)
      .map((type) => type.type.name),
    height: heightSpeech(pokemon.height),
    weight: weightSpeech(pokemon.weight),
    heightDm: pokemon.height,
    weightHg: pokemon.weight,
    abilities,
    habitat: habitatSpeech(species.habitat?.name ?? null),
    growth: growthSpeech(species.growth_rate?.name ?? "unknown"),
    catchLine: catchSpeech(species.capture_rate),
    captureRate: species.capture_rate,
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
    isBaby: species.is_baby,
    flavor: pickFlavor(species),
    flavorSources: species.flavor_text_entries
      .filter((entry) => entry.language.name === "en")
      .map((entry) => ({
        text: cleanFlavor(entry.flavor_text),
        version: entry.version.name,
      })),
    evolution: describeChain(chain.chain, pokemon.name),
    stats,
    statTotal: stats.reduce((sum, stat) => sum + stat.value, 0),
    artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`,
    cry: pokemon.cries?.latest ?? null,
    region: REGIONS[species.generation.name] ?? titleCaseName(species.generation.name),
  };
}
