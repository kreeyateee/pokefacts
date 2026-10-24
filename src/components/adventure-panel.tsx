"use client";

import { useEffect, useMemo, useState } from "react";

import { useAdventureListen } from "@/components/adventure-listen";
import { useFavourites } from "@/components/favourites";
import { pokeballOutcome, PokeballShow } from "@/components/pokeball-show";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/components/use-stored-state";
import { artworkSrc } from "@/lib/artwork-path";
import type { MixSettings } from "@/lib/playback-settings";
import { pickerVoice } from "@/lib/piper-voice";
import { storyIconPath, storyQuestionIconPath } from "@/lib/story/story-card";
import { endingCount, storyLines, storyTrackCount } from "@/lib/story/story-check";
import type { StoryGraph, StoryNode } from "@/lib/story/story-graph";
import { withoutCues } from "@/lib/story/story-sound";
import { withoutVoiceTags } from "@/lib/voice-tags";
import { castVoices, NARRATOR, speakerLines, type VoiceStyle } from "@/lib/story/story-voices";

const OWNER_KEY = "pokefacts.adventure-owner";
const KIND_KEY = "pokefacts.adventure-kind";

/** The adventures this panel can make, each served by /api/adventure/<id>. */
const ADVENTURES = {
  safari: {
    title: "Safari Zone",
    blurb:
      "Warden Marigold takes your child round all five stops, Barnaby the rival is always one step ahead, and every throw counts towards how the day ends. A perfect day brings a rare visitor.",
    ownerNote: "Marigold says it out loud.",
    opening: "Opening the gate…",
    failed: "The Safari Zone could not be opened.",
  },
  gym: {
    title: "Gym Challenge",
    blurb:
      "Eight gyms and the Champion, with Ronnie Rumble commentating. At every battle your child picks which Pokémon to send out with the left and right buttons, and learns which types win, and why.",
    ownerNote: "Ronnie announces it to the crowd.",
    opening: "Warming up the stadium…",
    failed: "The Gym Challenge could not be set up.",
  },
  island: {
    title: "Island Adventure",
    blurb:
      "Mabel the Wailord is lost on the beach. Your child rides her across the sea with Captain Brine, through fog, storms and coral reefs, to the island where her family sings, choosing the way with the left and right buttons.",
    ownerNote: "Captain Brine calls them by name.",
    opening: "Hoisting the sails…",
    failed: "The Island Adventure could not be opened.",
  },
  paldea: {
    title: "Paldea Picnic",
    blurb:
      "Your child chooses Sprigatito, Fuecoco or Quaxly, and sets off with classmates Juno and Arlo to gather ingredients for the Great Picnic Sandwich. Every battle counts towards the picnic, where their partner might evolve.",
    ownerNote: "Juno, Arlo and Ms Olwen call them by name.",
    opening: "Packing the picnic basket…",
    failed: "The Paldea Picnic could not be set up.",
  },
  lost: {
    title: "Find Your Trainer",
    blurb:
      "Your child plays as their own partner Pokémon, lost in a dungeon that suits its type, and finds the way back to them with the left and right buttons: following their voice, using their type's power, and helping a grumpy Pokémon at the bottom.",
    ownerNote: "Their partner hears them calling it by name.",
    opening: "Lighting the way down…",
    failed: "Find Your Trainer could not be set up.",
  },
  play: {
    title: "Friendly Battles",
    young: true,
    blurb:
      "Their favourite Pokémon plays with six friendly Pokémon at the Play Park: use its power, or do a silly dance. Every choice is a happy one, with short sentences and lots of sounds.",
    ownerNote: "Rosie the park keeper says hello to them.",
    opening: "Opening the Play Park…",
    failed: "Friendly Battles could not be set up.",
  },
  nursery: {
    title: "Pokémon Nursery",
    young: true,
    blurb:
      "Their favourite Pokémon helps Nurse Poppy look after five baby Pokémon: sleepy, hungry, chilly or muddy. Both buttons are kind ways to help, every baby ends up happy, and Poppy tells a little fact about each one.",
    ownerNote: "Nurse Poppy says hello to them.",
    opening: "Warming the blankets…",
    failed: "The Pokémon Nursery could not be opened.",
  },
  catch: {
    title: "Catch Quest",
    blurb:
      "Ranger Fern takes your child and a team of three along Route One. Each time a wild Pokémon jumps out, they pick which Pokémon to send out first, battle it, then catch it with a Poké Ball. Picking the strong type first time earns the best ending.",
    ownerNote: "Ranger Fern calls them by name.",
    opening: "Packing the Poké Balls…",
    failed: "Catch Quest could not be set up.",
  },
} as const;

type AdventureKind = keyof typeof ADVENTURES;

const parseKind = (raw: string | null): AdventureKind =>
  raw !== null && Object.hasOwn(ADVENTURES, raw) ? (raw as AdventureKind) : "safari";
const keepKind = (kind: AdventureKind) => kind;

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

const parseOwner = (raw: string | null) => (raw ?? "").slice(0, 40);
const keepOwner = (owner: string) => owner;

async function fetchAdventure(
  kind: AdventureKind,
  seed: number,
  owner: string,
  partner: number | undefined,
  signal: AbortSignal,
): Promise<StoryGraph> {
  const query = new URLSearchParams({ seed: String(seed) });
  if (owner.trim()) query.set("owner", owner.trim());
  if (partner) query.set("partner", String(partner));
  const response = await fetch(`/api/adventure/${kind}?${query}`, { signal });
  const payload = (await response.json().catch(() => null)) as { story?: StoryGraph; error?: string } | null;
  if (!response.ok || !payload?.story) throw new Error(payload?.error ?? ADVENTURES[kind].failed);
  return payload.story;
}

/** The node's 16×16 picture, or a plain marker for a stock Yoto icon the browser cannot show. */
/** A Pokémon the node shows: its own picture, not a shadow to guess. */
function shownPokemon(node: StoryNode): number | undefined {
  const icon = node.icon;
  return icon && "dexId" in icon && !icon.shadow ? icon.dexId : undefined;
}

function NodePicture({ node, battles }: { node: StoryNode; battles?: boolean }) {
  const path = storyIconPath(node);
  const fighter = battles ? shownPokemon(node) : undefined;
  if (fighter) {
    // In a battle story the page shows the Pokémon moving, as its animated battle sprite.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]"
        src={artworkSrc("battle", fighter)}
        alt=""
        width={96}
        height={96}
        onError={(event) => {
          event.currentTarget.src = path;
        }}
      />
    );
  }
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
    return <>{withoutVoiceTags(withoutCues(text))}</>;
  }
  return (
    <>
      {lines.map((line, index) => {
        // Sounds are heard, not read: the text stays clean sentences, and the Poké Ball shows the catch.
        if ("sound" in line || "cry" in line) return null;
        const character = cast.findIndex((item) => item.id === line.speaker);
        if (line.speaker === NARRATOR || character < 0) return <span key={index}>{withoutVoiceTags(line.text)} </span>;
        return (
          <span
            key={index}
            className={`font-semibold ${SPEAKER_COLOURS[character % SPEAKER_COLOURS.length]}`}
            title={cast[character]?.name}
          >
            ‘{withoutVoiceTags(line.text)}’{" "}
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
 * The adventure cards, Safari Zone and Gym Challenge: a child's name, a new draw, a play-through preview with Left and Right
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
  const [kind, setKind] = useStoredState(KIND_KEY, parseKind, keepKind);
  // The child's partner Pokémon comes along on every adventure.
  const [favourites] = useFavourites();
  const partner = favourites[0];
  const adventure = ADVENTURES[kind];
  // The panel only opens after the page has loaded, so a random first draw cannot upset hydration.
  const [seed, setSeed] = useState<number>(newSeed);
  const [story, setStory] = useState<StoryGraph | null>(null);
  const [error, setError] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [found, setFound] = useState<ReadonlySet<number>>(() => new Set());
  // Bumped to play the Poké Ball again: on arriving at a scene, and when its sound plays.
  const [ballPlay, setBallPlay] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchAdventure(kind, seed, owner, partner, controller.signal)
        .then((next) => {
          setStory(next);
          setError("");
          setNodeId((current) => (next.nodes.some((node) => node.id === current) ? current : next.start));
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : ADVENTURES[kind].failed);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [kind, seed, owner, partner]);

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
    setBallPlay((count) => count + 1);
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

  function chooseKind(next: AdventureKind) {
    if (next === kind) return;
    listener.stop();
    setStory(null);
    setError("");
    setFound(new Set());
    setNodeId("");
    setKind(next);
    // Every visit to an adventure is a new one.
    setSeed(newSeed());
  }

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <section className="min-w-0" aria-labelledby="adventure-setup">
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Adventure">
          {(Object.keys(ADVENTURES) as AdventureKind[]).map((option) => (
            <Button
              key={option}
              type="button"
              variant={option === kind ? "default" : "outline"}
              className="h-10 grow px-3"
              aria-pressed={option === kind}
              onClick={() => chooseKind(option)}
            >
              {ADVENTURES[option].title}
              {"young" in ADVENTURES[option] ? <span className="ml-1.5 text-xs font-normal opacity-80">for younger kids</span> : null}
            </Button>
          ))}
        </div>
        <h2 id="adventure-setup" className="pk-section-title">
          {adventure.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {"young" in adventure ? "A choose-your-own-adventure card for younger children, about three to five." : "A choose-your-own-adventure card for ages 8 to 12."}{" "}
          {adventure.blurb}
        </p>
        {(kind === "lost" || kind === "play" || kind === "nursery" || kind === "catch") && !partner ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No favourite chosen yet, so your child plays as Pikachu. Add their favourite below, and they play as that one.
          </p>
        ) : null}
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
          Letters, spaces, hyphens and apostrophes. {adventure.ownerNote}
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
          error ? null : <p className="mt-2 text-sm text-muted-foreground">{adventure.opening}</p>
        ) : (
          <div className="pk-card mt-2 px-4 py-4">
            <div className="flex items-center gap-3">
              <NodePicture node={node} battles={story.battles} />
              <div className="min-w-0">
                <p className="pk-kicker">{node.kind === "ending" ? `Ending ${node.ending.number} of ${endings}` : node.title}</p>
                {node.dexId ? <p className="text-xs text-muted-foreground">A Pokémon cry plays first.</p> : null}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line leading-7">
              <SpokenText text={lines.narration} story={story} />
            </p>
            {pokeballOutcome(node.text) ? (
              <div className="mt-3 flex justify-center">
                <PokeballShow outcome={pokeballOutcome(node.text) ?? "caught"} play={ballPlay} />
              </div>
            ) : null}
            {lines.question ? (
              <p className="mt-3 flex items-center gap-2 font-medium">
                {storyQuestionIconPath(node) !== storyIconPath(node) && !storyQuestionIconPath(node).startsWith("yoto:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={storyQuestionIconPath(node)}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0 rounded bg-black p-0.5 [image-rendering:pixelated]"
                  />
                ) : null}
                {lines.question}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                onClick={() =>
                  listener.listening
                    ? listener.stop()
                    : void listener.listen(story, node, lines, (sound) => {
                        if (sound === "catch" || sound === "escape") setBallPlay((count) => count + 1);
                      })
                }
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
