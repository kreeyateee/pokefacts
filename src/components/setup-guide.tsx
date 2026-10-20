"use client";

import { LOCAL_APP_ORIGIN, YOTO_REDIRECT_URI } from "@/lib/local-origin";
import { YOTO_SCOPES } from "@/lib/yoto-icons";

const SCOPES = YOTO_SCOPES.split(" ");

export function SetupGuide({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="pk-card mx-auto max-w-3xl px-5 py-6 sm:px-8">
      <h2 className="font-display text-3xl">Put a playlist on a card</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Connect Yoto, send a playlist, then link that playlist to a blank Make Your Own card in the Yoto app.
        Your child does not need this page.
      </p>
      <ol className="mt-5 grid gap-3 text-sm leading-6">
        <li>
          <span className="font-bold">1. Connect Yoto.</span> Pokefacts asks for permission to make playlists in your
          library. It never asks for your Yoto password.
        </li>
        <li>
          <span className="font-bold">2. Pick what to send.</span> Facts, Guess Who, Mega Evolutions, Gigantamax, or a
          catalogue pick.
        </li>
        <li>
          <span className="font-bold">3. Press Hear, then Send.</span> Hear plays one entry on this page. Send puts the
          whole playlist in Make Your Own.
        </li>
        <li>
          <span className="font-bold">4. Link it in the Yoto app.</span> Open Make Your Own, find the playlist name, and
          choose Link to a card. Hold a blank card to the player. The next playlist needs another blank card.
        </li>
      </ol>
      <button
        type="button"
        className="mt-6 h-11 rounded-full border-[3px] border-ink bg-poke-red px-5 font-heading text-sm font-bold text-white shadow-[3px_3px_0_var(--ink)]"
        onClick={onConnect}
      >
        Connect Yoto
      </button>
      <details className="mt-6 text-sm leading-6">
        <summary className="cursor-pointer font-bold">
          If you run Pokefacts on your own computer
        </summary>
      <ol className="mt-4 grid gap-4">
        <li>
          <span className="font-bold">1. Install Node.js 22.14 or newer.</span> Pokefacts will not start on an older
          Node.
        </li>
        <li>
          <span className="font-bold">2. Install ffmpeg.</span> On Windows, in a new command window:{" "}
          <code className="rounded bg-white px-1">winget install Gyan.FFmpeg</code>. ffmpeg joins the cry to the voice.
        </li>
        <li>
          <span className="font-bold">3. Install and start.</span> In the Pokefacts folder, run{" "}
          <code className="rounded bg-white px-1">npm install</code>, then{" "}
          <code className="rounded bg-white px-1">npm start</code>.
        </li>
        <li>
          <span className="font-bold">4. Open this address.</span>{" "}
          <a className="font-bold text-poke-red underline" href={LOCAL_APP_ORIGIN}>
            {LOCAL_APP_ORIGIN}
          </a>
        </li>
        <li>
          <span className="font-bold">5. Create a public Yoto app.</span> At{" "}
          <a className="font-bold text-poke-red underline" href="https://dashboard.yoto.dev/" target="_blank" rel="noreferrer">
            dashboard.yoto.dev
          </a>{" "}
          choose public. There is no client secret. Set the redirect to exactly{" "}
          <code className="rounded bg-white px-1">{YOTO_REDIRECT_URI}</code>.
        </li>
        <li>
          <span className="font-bold">6. Allow these permissions.</span>{" "}
          {SCOPES.map((scope) => (
            <code key={scope} className="mr-1 rounded bg-white px-1">
              {scope}
            </code>
          ))}
        </li>
        <li>
          <span className="font-bold">7. Connect Yoto.</span> Paste the client ID and sign in. Leave the instruction
          window open while a playlist is recording.
        </li>
      </ol>
      </details>
    </section>
  );
}
