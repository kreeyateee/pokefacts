import { cacheLife } from "next/cache";

import type { MonSheet } from "@/lib/dex-facts";
import { kidCardsFromDex, type KidCard } from "@/lib/kid-cards";
import { getDossier } from "@/lib/poke";
import type { Dossier } from "@/lib/types";

const ROSTER_IDS = [1, 4, 7, 25, 133, 39, 143, 94, 321];

export function sheetFromDossier(dossier: Dossier): MonSheet {
  const ability = dossier.abilities.find((item) => !item.hidden) ?? dossier.abilities[0];
  return {
    id: dossier.id,
    name: dossier.name,
    genus: dossier.genus,
    types: dossier.types,
    heightDecimetres: dossier.heightDm,
    weightHectograms: dossier.weightHg,
    stats: dossier.stats.map((stat) => ({ name: stat.name, value: stat.value })),
    abilityName: ability?.name ?? null,
    abilityEffect: ability?.effect ?? null,
    evolution: dossier.evolution,
    habitat: dossier.habitat,
    entries: dossier.flavorSources,
  };
}

export async function loadKidCards(): Promise<KidCard[]> {
  "use cache";
  cacheLife("hours");
  const dossiers = await Promise.all(ROSTER_IDS.map((id) => getDossier(id)));
  return kidCardsFromDex(dossiers.map(sheetFromDossier));
}
