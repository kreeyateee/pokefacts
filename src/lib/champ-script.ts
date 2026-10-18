import { statSpeech } from "@/lib/format";
import type { ChampBrief, Dossier } from "@/lib/types";

function typeSentence(dossier: Dossier): string {
  const types = dossier.types.map(
    (type) => type.charAt(0).toUpperCase() + type.slice(1),
  );
  if (types.length === 1) {
    return `${dossier.name} is a ${types[0]} type. Train for that matchup.`;
  }
  return `${dossier.name} is ${types[0]} and ${types[1]}. Both types matter in a real battle.`;
}

function statusSentence(dossier: Dossier): string | null {
  if (dossier.isMythical) {
    return "This is a mythical Pokémon. Most trainers only meet it inside a story. Treat the meeting like a final.";
  }
  if (dossier.isLegendary) {
    return "Mark this one legendary. The league does not hand these out, and a champion does not take the battle lightly.";
  }
  if (dossier.isBaby) {
    return "It is a baby Pokémon. Give the training time, and the rest of the line will show up.";
  }
  return null;
}

function abilitySentences(dossier: Dossier): string {
  if (dossier.abilities.length === 0) {
    return "No ability is on file.";
  }
  return dossier.abilities
    .map((ability) => {
      const effect = ability.effect.replace(/\s+/g, " ").trim();
      const lead = ability.hidden
        ? `A hidden ability, ${ability.name},`
        : `Its ability is ${ability.name}.`;
      if (!effect) return ability.hidden ? `${lead} is on file.` : lead;
      if (ability.hidden) return `${lead} ${lowerFirst(effect)}`;
      return `${lead} ${effect}`;
    })
    .join(" ");
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function statSentence(dossier: Dossier): string {
  const sorted = [...dossier.stats].sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (!best || !worst) return `The sheet totals ${dossier.statTotal}.`;
  if (best.value === worst.value) {
    return `Every stat sits at ${best.value}. The sheet totals ${dossier.statTotal}.`;
  }
  const lead = `${capitalize(statSpeech(best.slug))} leads at ${best.value}.`;
  const soft = `${capitalize(statSpeech(worst.slug))} is the soft spot at ${worst.value}.`;
  return `${lead} ${soft} The sheet totals ${dossier.statTotal}.`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildChampBrief(dossier: Dossier): ChampBrief {
  const status = statusSentence(dossier);
  const [lead, classic] = dossier.flavor;
  const call = [
    `${dossier.name}. National number ${dossier.id}. The ${dossier.genus}.`,
    typeSentence(dossier),
    status,
    lead
      ? `The ${lead.version} entry says: ${lead.text}`
      : "The field notes for this Pokémon are still blank.",
    classic
      ? `An earlier note, from ${classic.version}, still holds: ${classic.text}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const measure = [
    `Here is the measure. ${dossier.name} stands ${dossier.height}, and weighs ${dossier.weight}.`,
    `It grows at a ${dossier.growth} pace. ${dossier.catchLine}`,
    abilitySentences(dossier),
    dossier.habitat,
  ].join(" ");

  const line = [`The line. ${dossier.evolution}`, statSentence(dossier)].join(" ");

  const tracks = [
    { key: "call", title: `${dossier.name}, the call`, text: clamp(call) },
    { key: "measure", title: `${dossier.name}, the measure`, text: clamp(measure) },
    { key: "line", title: `${dossier.name}, the line`, text: clamp(line) },
  ];

  return { tracks };
}

function clamp(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 2900) return clean;
  return `${clean.slice(0, 2850).trim()} That's the briefing.`;
}

export function briefScript(dossier: Dossier): string {
  return buildChampBrief(dossier)
    .tracks.map((track) => track.text)
    .join("\n\n");
}
