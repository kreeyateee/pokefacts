"use client";

import { useEffect, useMemo, useState } from "react";

import { useAdventureListen } from "@/components/adventure-listen";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/components/use-stored-state";
import type { MixSettings } from "@/lib/playback-settings";
import { pickerVoice } from "@/lib/piper-voice";
import { storyIconPath } from "@/lib/story/story-card";
import { endingCount, storyLines, storyTrackCount } from "@/lib/story/story-check";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import { withoutCues } from "@/lib/story/story-sound";
import { castVoices, NARRATOR, speakerLines, type VoiceStyle } from "@/lib/story/story-voices";

const OWNER_KEY = "pokefacts.adventure-owner";

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

const parseOwner = (raw: string | null) => (raw ?? "").slice(0, 40);
const keepOwner = (owner: string) => owner;

async function fetchSafari(seed: number, owner: string, signal: AbortSignal): Promise<StoryGraph> {
  const query = new URLSearchParams({ seed: String(seed) });
  if (owner.trim()) query.set("owner", owner.trim());
  const response = await fetch(`/api/adventure/safari?${query}`, { signal });
  const payload = (await response.json().catch(() => null)) as { story?: StoryGraph; error?: string } | null;
  if (!response.ok || !payload?.story) throw new Error(payload?.error ?? "The Safari Zone could not be opened.");
  return payload.story;
}

/** The node's 16×16 picture, or a plain marker for a stock Yoto icon the browser cannot show. */
function NodePicture({ node }: { node: StoryNode }) {
  const path = storyIconPath(node);
  if (path.startsWith("yoto:")) {
    return (
      <span
        className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-black text-2xl font-bold text-poke-yellow"
        aria-hidden="true"
      >
        {node.kind === "ending" ? "★" : node.kind === "choice" ? "?" : "…"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="h-16 w-16 shrink-0 rounded-md bg-black p-1 [image-rendering:pixelated]"
      src={path}
      alt=""
      width={64}
      height={64}
    />
  );
}

/** Each character's lines are coloured on the page, so you can see who will speak them. */
const SPEAKER_COLOURS = ["text-[#b3400c]", "text-[#22609f]", "text-[#5b3f9e]"];

/** The words on the page, with each character's lines in their colour and a marker where a sound plays. */
function SpokenText({ text, story }: { text: string; story: StoryGraph }) {
  const cast = story.cast ?? [];
  let lines;
  try {
    lines = speakerLines(text, cast);
  } catch {
    return <>{withoutCues(text)}</>;
  }
  return (
    <>
      {lines.map((line, index) => {
        if ("sound" in line) {
          return (
            <span
              key={index}
              className="mx-1 inline-block rounded-full bg-poke-red px-2 align-middle text-xs font-bold text-white"
              title="The Poké Ball catch sound plays here"
            >
              ● ● ● click!
            </span>
          );
        }
        const character = cast.findIndex((item) => item.id === line.speaker);
        if (line.speaker === NARRATOR || character < 0) return <span key={index}>{line.text} </span>;
        return (
          <span
            key={index}
            className={`font-semibold ${SPEAKER_COLOURS[character % SPEAKER_COLOURS.length]}`}
            title={cast[character]?.name}
          >
            ‘{line.text}’{" "}
          </span>
        );
      })}
    </>
  );
}

function styleNote(style: VoiceStyle | undefined): string {
  if (!style) return "";
  const name = pickerVoice(style.voiceId).name;
  const pitch = style.pitch < 0 ? "lower" : style.pitch > 0 ? "higher" : "";
  const pace = style.tempo < 1 ? "slower" : style.tempo > 1 ? "quicker" : "";
  const shift = [pitch, pace].filter(Boolean).join(" and ");
  return shift ? `${name}, ${shift}` : name;
}

/**
 * The Safari Zone adventure: a child's name, a new draw, a play-through preview with Left and Right
 * that can be listened to, and Send to Yoto. The studio owns sending; this panel only hands it the story.
 */
export function AdventurePanel({
  sending,
  onSend,
  voiceId,
  connected,
  mix,
}: {
  sending: boolean;
  onSend: (story: StoryGraph) => Promise<void>;
  /** The narrator's voice from Settings. */
  voiceId: string;
  /** Signed in to Yoto, so the page can play the voices the card will use. */
  connected: boolean;
  mix: MixSettings;
}) {
  const listener = useAdventureListen({ voiceId, connected, mix });
  const [owner, setOwner] = useStoredState(OWNER_KEY, parseOwner, keepOwner);
  // The panel only opens after the page has loaded, so a random first draw cannot upset hydration.
  const [seed, setSeed] = useState<number>(newSeed);
  const [story, setStory] = useState<StoryGraph | null>(null);
  const [error, setError] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [found, setFound] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSafari(seed, owner, controller.signal)
        .then((next) => {
          setStory(next);
          setError("");
          setNodeId((current) => (next.nodes.some((node) => node.id === current) ? current : next.start));
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : "The Safari Zone could not be opened.");
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [seed, owner]);

  const byId = useMemo(() => new Map((story?.nodes ?? []).map((node) => [node.id, node])), [story]);
  const endings = story ? endingCount(story) : 0;
  const node = byId.get(nodeId) ?? (story ? byId.get(story.start) : undefined);
  const lines = node ? storyLines(node, endings) : null;
  const endingNames = useMemo(
    () =>
      (story?.nodes ?? [])
        .flatMap((item) => (item.kind === "ending" ? [item.ending] : []))
        .sort((a, b) => a.number - b.number),
    [story],
  );

  function go(to: string) {
    const next = byId.get(to);
    if (!next) return;
    listener.stop();
    setNodeId(to);
    if (next.kind === "ending") setFound((current) => new Set(current).add(next.ending.number));
  }

  function freshAdventure() {
    listener.stop();
    setFound(new Set());
    setNodeId("");
    setSeed(newSeed());
  }

  function changeOwner(value: string) {
    setOwner(value);
  }

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <section className="min-w-0" aria-labelledby="adventure-setup">
        <h2 id="adventure-setup" className="pk-section-title">
          Safari Zone
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A choose-your-own-adventure card for ages 8 to 12. Warden Marigold takes your child round six stops,
          Barnaby the rival is always one step ahead, and the left and right buttons on the Yoto Player pick what
          happens next.
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Child&apos;s name (optional)</span>
          <input
            className="pk-field mt-1 w-full"
            value={owner}
            maxLength={40}
            autoComplete="off"
            placeholder="Trainer"
            onChange={(event) => changeOwner(event.target.value)}
          />
        </label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Letters, spaces, hyphens and apostrophes. Marigold says it out loud.
        </p>
        <div className="mt-4 grid gap-2">
          <Button type="button" variant="outline" className="h-11 w-full" onClick={freshAdventure}>
            New adventure
          </Button>
          <Button
            type="button"
            className="h-11 w-full"
            disabled={!story || sending}
            onClick={() => {
              if (story) void onSend(story);
            }}
          >
            {sending ? "Sending…" : "Send to Yoto"}
          </Button>
        </div>
        {story ? (
          <p className="mt-2 text-xs leading-5 pk-quiet">
            {storyTrackCount(story)} tracks, {endings} endings. Each new adventure draws different Pokémon.
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Button choices work on a 3rd-generation Yoto Player or Yoto Mini. Yoto has not switched them on for the
          4th-generation players yet, and the Yoto app plays the card straight through.
        </p>
      </section>

      <section className="min-w-0" aria-labelledby="adventure-preview" aria-live="polite">
        <h2 id="adventure-preview" className="pk-section-title">
          Try it here first
        </h2>
        {error ? <p className="mt-2 text-sm pk-danger">{error}</p> : null}
        {!story || !node || !lines ? (
          error ? null : <p className="mt-2 text-sm text-muted-foreground">Opening the gate…</p>
        ) : (
          <div className="pk-card mt-2 px-4 py-4">
            <div className="flex items-center gap-3">
              <NodePicture node={node} />
              <div className="min-w-0">
                <p className="pk-kicker">{node.kind === "ending" ? `Ending ${node.ending.number} of ${endings}` : node.title}</p>
                {node.dexId ? <p className="text-xs text-muted-foreground">A Pokémon cry plays first.</p> : null}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line leading-7">
              <SpokenText text={lines.narration} story={story} />
            </p>
            {lines.question ? <p className="mt-3 font-medium">{lines.question}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                onClick={() => (listener.listening ? listener.stop() : void listener.listen(story, node, lines))}
              >
                {listener.listening ? "■ Stop" : "▶ Listen"}
              </Button>
              {listener.note ? <span className="text-xs text-muted-foreground">{listener.note}</span> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {node.kind === "choice" ? (
                <>
                  <Button type="button" className="h-11 px-4" onClick={() => go(node.left.to)}>
                    ◀ Left: {node.left.label}
                  </Button>
                  <Button type="button" className="h-11 px-4" onClick={() => go(node.right.to)}>
                    Right: {node.right.label} ▶
                  </Button>
                </>
              ) : node.kind === "scene" ? (
                <Button type="button" className="h-11 px-4" onClick={() => go(node.next)}>
                  Carry on
                </Button>
              ) : (
                <Button type="button" className="h-11 px-4" onClick={() => go(story.start)}>
                  Play again
                </Button>
              )}
              {node.id !== story.start && node.kind !== "ending" ? (
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => go(story.start)}>
                  Start again
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              On the player, a scene carries on by itself and a question repeats until a button is pressed.
            </p>
            <VoiceKey story={story} voiceId={voiceId} />
          </div>
        )}
        {story ? (
          <div className="mt-4">
            <p className="pk-kicker">
              Endings found: {found.size} of {endings}
            </p>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {endingNames.map((ending) => (
                <li key={ending.number} className={found.has(ending.number) ? "font-medium" : "text-muted-foreground"}>
                  {ending.number}. {found.has(ending.number) ? ending.name : "???"}
                  {found.has(ending.number) && ending.golden ? " ★" : ""}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Who reads what: the narrator in the Settings voice, and each character in theirs. */
function VoiceKey({ story, voiceId }: { story: StoryGraph; voiceId: string }) {
  const cast = story.cast ?? [];
  if (cast.length === 0) return null;
  const voices = castVoices(voiceId, cast);
  return (
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Voices: narrator {styleNote(voices[NARRATOR])}
      {cast.map((character, index) => (
        <span key={character.id}>
          {"; "}
          <span className={`font-semibold ${SPEAKER_COLOURS[index % SPEAKER_COLOURS.length]}`}>{character.name}</span>{" "}
          {styleNote(voices[character.id])}
        </span>
      ))}
      . Change the narrator in Settings.
    </p>
  );
}
