import { buildChampBrief } from "@/lib/champ-script";
import { iconForType, YOTO_ICONS } from "@/lib/yoto-icons";
import type { Dossier } from "@/lib/types";

export type YotoContent = {
  title: string;
  cardId?: string;
  content: {
    chapters: Array<{
      key: string;
      title: string;
      overlayLabel: string;
      display: { icon16x16: string };
      tracks: Array<{
        key: string;
        title: string;
        trackUrl: string;
        type: "elevenlabs";
        overlayLabel: string;
        display: { icon16x16: string };
      }>;
    }>;
  };
  metadata: {
    title: string;
    description: string;
  };
};

const TRACK_ICONS = [null, YOTO_ICONS.book, YOTO_ICONS.star] as const;

export function buildChampCard(
  entries: Dossier[],
  cardId?: string,
): YotoContent {
  const chapters = entries.map((entry, index) => {
    const brief = buildChampBrief(entry);
    const icon = iconForType(entry.types[0]);
    return {
      key: `ch-${entry.id}`,
      title: entry.name,
      overlayLabel: String(index + 1),
      display: { icon16x16: icon },
      tracks: brief.tracks.map((track, trackIndex) => ({
        key: `${entry.id}-${track.key}`,
        title: track.title,
        trackUrl: track.text,
        type: "elevenlabs" as const,
        overlayLabel: String(trackIndex + 1),
        display: {
          icon16x16: TRACK_ICONS[trackIndex] ?? icon,
        },
      })),
    };
  });

  const title =
    entries.length === 1
      ? `Champdex: ${entries[0]?.name ?? "Briefing"}`
      : `Champdex · ${entries.length} briefings`;

  const names = entries.map((entry) => entry.name).join(", ");
  const content: YotoContent = {
    title,
    content: { chapters },
    metadata: {
      title,
      description: `Champion field notes for ${names}. Spoken for a Yoto Make Your Own card.`,
    },
  };
  if (cardId) content.cardId = cardId;
  return content;
}
