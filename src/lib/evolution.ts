import { titleCaseName } from "@/lib/format";

type Named = { name: string } | null;

type EvolutionDetail = {
  min_level: number | null;
  trigger: Named;
  item: Named;
  held_item: Named;
  known_move: Named;
  min_happiness: number | null;
  min_affection: number | null;
  time_of_day: string;
  location: Named;
  known_move_type: Named;
  party_species: Named;
  trade_species: Named;
  gender: number | null;
  relative_physical_stats: number | null;
  needs_overworld_rain: boolean;
  turn_upside_down: boolean;
};

export type EvolutionNode = {
  species: { name: string; url: string };
  evolution_details: EvolutionDetail[];
  evolves_to: EvolutionNode[];
};

function itemName(slug: string): string {
  return titleCaseName(slug);
}

function placeName(slug: string): string {
  return titleCaseName(slug.replace(/^mt-/, "mount-"));
}

function describeDetail(detail: EvolutionDetail): string {
  const trigger = detail.trigger?.name ?? "";
  const bits: string[] = [];

  if (trigger === "level-up") {
    bits.push(detail.min_level ? `at level ${detail.min_level}` : "by leveling up");
  } else if (trigger === "use-item") {
    bits.push(
      detail.item ? `with a ${itemName(detail.item.name)}` : "with a special item",
    );
  } else if (trigger === "trade") {
    bits.push("when traded");
    if (detail.held_item) {
      bits.push(`while holding a ${itemName(detail.held_item.name)}`);
    }
    if (detail.trade_species) {
      bits.push(`in exchange for ${titleCaseName(detail.trade_species.name)}`);
    }
  } else if (trigger === "shed") {
    bits.push("when there is an empty spot in the party");
  } else if (trigger === "spin") {
    bits.push("while the trainer spins");
  } else if (trigger === "three-critical-hits") {
    bits.push("after landing three critical hits in one battle");
  } else if (trigger === "take-damage") {
    bits.push("after taking a hit and reaching the right place");
  } else if (trigger) {
    bits.push(`through ${trigger.replace(/-/g, " ")}`);
  }

  if (detail.min_happiness) bits.push("once it is very happy");
  if (detail.min_affection) bits.push("once your bond is strong");
  if (detail.time_of_day) bits.push(`during the ${detail.time_of_day}`);
  if (detail.known_move) {
    bits.push(`after it learns ${titleCaseName(detail.known_move.name)}`);
  }
  if (detail.known_move_type) {
    bits.push(
      `after it learns a ${titleCaseName(detail.known_move_type.name)} move`,
    );
  }
  if (detail.location) bits.push(`around ${placeName(detail.location.name)}`);
  if (detail.held_item && trigger !== "trade") {
    bits.push(`while holding a ${itemName(detail.held_item.name)}`);
  }
  if (detail.party_species) {
    bits.push(`with ${titleCaseName(detail.party_species.name)} in the party`);
  }
  if (detail.gender === 1) bits.push("if it is female");
  if (detail.gender === 2) bits.push("if it is male");
  if (detail.relative_physical_stats === 1) {
    bits.push("if its attack is higher than its defense");
  }
  if (detail.relative_physical_stats === -1) {
    bits.push("if its defense is higher than its attack");
  }
  if (detail.relative_physical_stats === 0) {
    bits.push("if its attack and defense are equal");
  }
  if (detail.needs_overworld_rain) bits.push("while rain is falling");
  if (detail.turn_upside_down) bits.push("while the system is held upside down");

  return bits.join(" ");
}

function walk(node: EvolutionNode, from: string | null, lines: string[]) {
  const name = titleCaseName(node.species.name);
  if (from) {
    const hows = (node.evolution_details ?? [])
      .map(describeDetail)
      .filter(Boolean);
    const how = hows.length > 0 ? hows.join(", or ") : "under a special condition";
    lines.push(`${from} becomes ${name} ${how}`);
  }
  for (const next of node.evolves_to ?? []) walk(next, name, lines);
}

export function describeChain(chain: EvolutionNode, currentSlug: string): string {
  const lines: string[] = [];
  walk(chain, null, lines);
  const current = titleCaseName(currentSlug);
  if (lines.length === 0) return `${current} does not evolve.`;
  const body = `${lines.join(". ")}.`;
  const first = titleCaseName(chain.species.name);
  if (first !== current) {
    return `${body} This briefing is for ${current}, partway along that line.`;
  }
  return body;
}
