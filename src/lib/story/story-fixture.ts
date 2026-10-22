import type { StoryGraph } from "@/lib/story/story-graph";

/** A small story for tests: a scene, a choice with a cry, a scene, and two endings. */
export function smallStory(): StoryGraph {
  return {
    id: "safari-test",
    title: "Safari test",
    description: "A short trip into the Safari Zone.",
    start: "gate",
    nodes: [
      { id: "lake", kind: "ending", title: "By the lake", text: "A Psyduck splashes you.", ending: { number: 1, name: "Wet socks" } },
      { id: "gate", kind: "scene", title: "The gate", text: "You step into the Safari Zone.", next: "grass" },
      {
        id: "grass",
        kind: "choice",
        title: "Tall grass",
        text: "Something rustles in the grass.",
        dexId: 113,
        icon: { dexId: 113, shadow: true },
        left: { to: "lake", label: "head for the lake" },
        right: { to: "rock", label: "throw a rock" },
      },
      { id: "rock", kind: "scene", title: "The rock", text: "Chansey stops.", icon: { dexId: 113 }, next: "catch" },
      {
        id: "catch",
        kind: "ending",
        title: "Caught",
        text: "You catch Chansey.",
        icon: { yoto: "abc123" },
        ending: { number: 2, name: "Lucky catch", golden: true },
      },
    ],
  };
}
