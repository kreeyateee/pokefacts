import { LILY_VOICE_ID, shadowPixelPath, type KidCard, type KidChapter, type KidTrack } from "@/lib/kid-cards";
import { chosenVoice } from "@/lib/piper-voice";
import { pronounce } from "@/lib/pronounce";
import { checkStory, endingCount, storyLines } from "@/lib/story/story-check";
import type { StoryGraph, StoryIcon, StoryNode, StoryNodeId } from "@/lib/story/story-graph";
import { STORY_PIXELS, type StoryPixel } from "@/lib/story/pokeball";
import { withoutCues, type StoryBed } from "@/lib/story/story-sound";
import {
  castVoices,
  fallbackVoices,
  NARRATOR,
  trackParts,
  type StoryCharacter,
  type TrackPart,
  type VoiceStyle,
} from "@/lib/story/story-voices";
import type {
  YotoContent,
  YotoEditSettings,
  YotoInteractiveConfig,
  YotoTrackEvent,
  YotoTrackEvents,
} from "@/lib/kid-cards";
import { YOTO_ICONS } from "@/lib/yoto-icons";
import type { PlaylistUpload } from "@/lib/yoto-send";

/** A card left alone for 30 days starts again from the beginning. Yoto's own converter uses this. */
export const STORY_RESUME_SECONDS = 30 * 24 * 60 * 60;

/** Only the buttons move the story on; the wheel and auto-advance are off. */
export const STORY_CONFIG: YotoInteractiveConfig = {
  autoadvance: "none",
  disableTrackNav: true,
  disableChapterNav: true,
  resumeTimeout: STORY_RESUME_SECONDS,
};

export const STORY_EDIT_SETTINGS: YotoEditSettings = {
  autoOverlayLabels: "chapters",
  editKeys: false,
  interactiveContent: true,
};

/** Stock pictures for a node with no icon of its own. */
const DEFAULT_ICONS: Record<StoryNode["kind"], string> = {
  scene: YOTO_ICONS.book,
  choice: YOTO_ICONS.star,
  ending: YOTO_ICONS.celebrate,
};

const QUESTION_TITLE = "Your choice";

/** The narration track: the first track of a node's chapter, where every jump lands. */
export function narrationKey(id: StoryNodeId): string {
  return `${id}a`;
}

/** The question track of a choice, which repeats until a button is pressed. */
export function questionKey(id: StoryNodeId): string {
  return `${id}q`;
}

function goto(chapterKey: StoryNodeId, trackKey = narrationKey(chapterKey)): YotoTrackEvent {
  return { cmd: "goto", params: { chapterKey, trackKey } };
}

/**
 * Button and end-of-track events for each of a node's tracks, in track order.
 * Both tracks of a choice take a button press, and both end on the question, which then repeats.
 * An ending goes back to the start of the story, at once if a button is pressed.
 */
function nodeEvents(node: StoryNode, start: StoryNodeId): YotoTrackEvents[] {
  if (node.kind === "scene") return [{ onEnd: goto(node.next) }];
  if (node.kind === "ending") return [{ onLhb: goto(start), onRhb: goto(start), onEnd: goto(start) }];
  const waiting = (): YotoTrackEvents => ({
    onLhb: goto(node.left.to),
    onRhb: goto(node.right.to),
    onEnd: goto(node.id, questionKey(node.id)),
  });
  return [waiting(), waiting()];
}

/** Picture path for a node: a pixel path the studio uploads, or a stock `yoto:#` icon. */
export function storyIconPath(node: Pick<StoryNode, "kind" | "icon">): string {
  return iconPath(node.icon, node.kind);
}

function iconPath(icon: StoryIcon | undefined, kind: StoryNode["kind"]): string {
  if (!icon) return DEFAULT_ICONS[kind];
  if ("yoto" in icon) return icon.yoto.startsWith("yoto:#") ? icon.yoto : `yoto:#${icon.yoto}`;
  if ("pixel" in icon) return STORY_PIXELS[icon.pixel];
  return icon.shadow ? shadowPixelPath(icon.dexId) : `/pixels/${icon.dexId}.png`;
}

/** The picture while a choice's question repeats: its own, or the node's. */
export function storyQuestionIconPath(node: StoryNode): string {
  return node.kind === "choice" && node.questionIcon ? iconPath(node.questionIcon, node.kind) : storyIconPath(node);
}

/**
 * Pixels the story shows. Upload each Pokémon with /api/yoto/icon (shadow=1 for the shadows),
 * and each named picture with /api/yoto/icon?name=.
 */
export function storyPixels(graph: StoryGraph): { real: number[]; shadow: number[]; named: string[] } {
  const real = new Set<number>();
  const shadow = new Set<number>();
  const named = new Set<string>();
  for (const node of graph.nodes) {
    for (const icon of [node.icon, node.kind === "choice" ? node.questionIcon : undefined]) {
      if (icon && "dexId" in icon) (icon.shadow ? shadow : real).add(icon.dexId);
      if (icon && "pixel" in icon) named.add(icon.pixel);
    }
  }
  return { real: [...real], shadow: [...shadow], named: [...named] };
}

type UploadedPixels = {
  realById: Record<number, string>;
  shadowById: Record<number, string>;
  namedById: Record<string, string>;
};

/** Swap a pixel path for its uploaded `yoto:#` media. A path with no upload is left for the send to reject. */
function uploadedIcon(path: string, uploaded: UploadedPixels): string {
  const named = (Object.entries(STORY_PIXELS) as Array<[StoryPixel, string]>).find(([, file]) => file === path);
  if (named) {
    const media = uploaded.namedById[named[0]];
    return media ? `yoto:#${media}` : path;
  }
  const match = /^\/pixels\/(\d+)(-shadow)?\.png$/.exec(path);
  if (!match) return path;
  const media = (match[2] ? uploaded.shadowById : uploaded.realById)[Number(match[1])];
  return media ? `yoto:#${media}` : path;
}

/** The start node first, then the rest in the order they were written. */
function chapterOrder(graph: StoryGraph): StoryNode[] {
  const start = graph.nodes.filter((node) => node.id === graph.start);
  return [...start, ...graph.nodes.filter((node) => node.id !== graph.start)];
}

/** Who speaks in this story, in which voice, which words are recorded on their own, and the Piper fallbacks. */
type Voicing = {
  voiceId: string;
  voices: Record<string, VoiceStyle>;
  cast: readonly StoryCharacter[];
  slots: readonly string[];
  fallback: Record<string, VoiceStyle>;
};

/**
 * One track. The page shows the words without sound cues. A track with dialogue or a sound also
 * carries its parts, so each line is recorded in its speaker's voice and joined into this one track.
 */
function storyTrack(
  key: string,
  title: string,
  text: string,
  icon: string,
  overlay: string,
  voicing: Voicing,
  bed?: StoryBed,
): KidTrack {
  const shown = withoutCues(text);
  const spoken = pronounce(shown);
  // Every adventure line goes through the joined recording, even a plain one, so each line is cached
  // by its words and voice and every line can fall back to Piper if Yoto's voices turn it away.
  const narrator = voicing.voices[NARRATOR] as VoiceStyle;
  const backup = voicing.fallback[NARRATOR];
  const parts: TrackPart[] = trackParts(text, voicing.voices, voicing.cast, pronounce, {
    slots: voicing.slots,
    fallback: voicing.fallback,
  }) ?? [{ text: spoken, ...narrator, ...(backup && backup.voiceId !== narrator.voiceId ? { fallback: backup } : {}) }];
  return {
    key,
    title,
    text: shown,
    spoken,
    icon,
    overlay,
    voiceId: voicing.voiceId,
    parts,
    ...(bed ? { bed } : {}),
  };
}

function storyChapter(
  node: StoryNode,
  index: number,
  endings: number,
  icon: string,
  questionIcon: string,
  voicing: Voicing,
): KidChapter {
  const overlay = String(index + 1);
  const lines = storyLines(node, endings);
  const narration = storyTrack(narrationKey(node.id), node.title.trim(), lines.narration, icon, overlay, voicing, node.bed);
  if (node.dexId) narration.lead = "cry";
  const tracks = [narration];
  if (lines.question) {
    tracks.push(storyTrack(questionKey(node.id), QUESTION_TITLE, lines.question, questionIcon, overlay, voicing));
  }
  return {
    key: node.id,
    title: node.title.trim(),
    overlay,
    picture: node.title.trim(),
    mark: node.kind === "ending" ? `Ending ${node.ending.number}` : overlay,
    icon,
    dexId: node.dexId,
    tracks,
  };
}

/**
 * Compile a story map into the studio's card and a Yoto interactive playlist upload.
 * One chapter per node, keyed by node id, so `card.chapters[i]` lines up with the upload for the cry.
 * Pass the uploaded pixel media ids so the player shows them. Throws when checkStory finds a problem.
 */
export function storyCard(
  graph: StoryGraph,
  options: {
    voiceId?: string;
    realById?: Record<number, string>;
    shadowById?: Record<number, string>;
    namedById?: Record<string, string>;
  } = {},
): { card: KidCard; upload: PlaylistUpload } {
  const problems = checkStory(graph);
  if (problems.length > 0) throw new Error(`${graph.title || "This story"} is not ready. ${problems.join(" ")}`);
  const voiceId = chosenVoice(options.voiceId ?? LILY_VOICE_ID);
  const cast = graph.cast ?? [];
  const voicing: Voicing = {
    voiceId,
    voices: castVoices(voiceId, cast),
    cast,
    slots: graph.slots ?? [],
    fallback: fallbackVoices(cast),
  };
  const endings = endingCount(graph);
  const nodes = chapterOrder(graph);
  const chapters = nodes.map((node, index) => {
    const uploaded = {
      realById: options.realById ?? {},
      shadowById: options.shadowById ?? {},
      namedById: options.namedById ?? {},
    };
    const icon = uploadedIcon(storyIconPath(node), uploaded);
    return storyChapter(node, index, endings, icon, uploadedIcon(storyQuestionIconPath(node), uploaded), voicing);
  });
  const card: KidCard = {
    id: graph.id,
    kind: "story",
    title: graph.title,
    rangeLabel: graph.title,
    libraryTitle: graph.title,
    blurb: graph.description,
    childDoes: "Press play to start. When the story asks, press the left or right button to choose.",
    chapters,
  };
  const content: YotoContent = {
    title: graph.title,
    content: {
      playbackType: "interactive",
      config: { ...STORY_CONFIG },
      editSettings: { ...STORY_EDIT_SETTINGS },
      chapters: chapters.map((chapter, index) => {
        const events = nodeEvents(nodes[index] as StoryNode, graph.start);
        return {
          key: chapter.key,
          title: chapter.title,
          overlayLabel: chapter.overlay,
          display: { icon16x16: chapter.icon },
          tracks: chapter.tracks.map((track, trackIndex) => ({
            key: track.key,
            title: track.title,
            trackUrl: track.spoken,
            type: "elevenlabs" as const,
            voiceId,
            overlayLabel: track.overlay,
            display: { icon16x16: track.icon },
            events: events[trackIndex] ?? {},
          })),
        };
      }),
    },
    metadata: {
      title: graph.title,
      description: `${graph.description} Press play, then press the left or right button when the story asks. Link this playlist to its own card.`,
    },
  };
  return { card, upload: { voiceId, create: true, content } };
}
