/**
 * A choose-your-own-adventure card as a map of story nodes.
 * The left and right buttons on a Yoto Player pick between two paths at a choice node.
 * The compiler (story-card.ts) turns this map into a Yoto interactive playlist.
 */

import type { StoryBed } from "@/lib/story/story-sound";
import type { StoryCharacter } from "@/lib/story/story-voices";

/** Short and unique: lowercase letters and digits, at most 8 characters. Used for Yoto chapter keys. */
export type StoryNodeId = string;

export type StoryChoice = {
  to: StoryNodeId;
  /** What the narrator says for this button: "throw bait", "head for the lake". */
  label: string;
};

/**
 * A 16×16 picture on the player screen: a Pokémon's pixel icon or shadow, one of the story's own
 * pictures (the Poké Ball), or a stock Yoto icon id.
 */
export type StoryIcon = { dexId: number; shadow?: boolean } | { pixel: "pokeball" } | { yoto: string };

type NodeBase = {
  id: StoryNodeId;
  /** Shown in the Yoto app's track list. Keep it short and spoiler-free. */
  title: string;
  /**
   * What is said. Plain sentences, at most 3000 characters. Dialogue goes in single quotes and is read
   * in the speaker's voice; a cue such as [catch] plays a sound there.
   */
  text: string;
  /** Plays this Pokémon's cry before the narration. */
  dexId?: number;
  icon?: StoryIcon;
  /** Ambience and music under the narration. The repeating question plays without them. */
  bed?: StoryBed;
};

/** Narration that carries straight on to `next`. */
export type SceneNode = NodeBase & { kind: "scene"; next: StoryNodeId };

/** Narration, then a short question that repeats until a button is pressed. */
export type ChoiceNode = NodeBase & { kind: "choice"; left: StoryChoice; right: StoryChoice };

/** The story stops here. Endings are numbered so a child can collect them. */
export type EndingNode = NodeBase & {
  kind: "ending";
  ending: { number: number; name: string; golden?: boolean };
};

export type StoryNode = SceneNode | ChoiceNode | EndingNode;

export type StoryGraph = {
  /** Stable id for this adventure and send, such as "safari-1234". */
  id: string;
  title: string;
  /** One or two sentences for the Yoto library. */
  description: string;
  start: StoryNodeId;
  nodes: StoryNode[];
  /** Characters who speak, each in their own voice. Without a cast, the narrator reads everything. */
  cast?: StoryCharacter[];
  /**
   * Words that change from one send to the next, such as Pokémon names and the child's name. Each is
   * recorded as its own short clip, so the wording around it is the same every time and can be reused.
   */
  slots?: string[];
};
