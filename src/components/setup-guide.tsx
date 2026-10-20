"use client";

import { LOCAL_APP_ORIGIN, YOTO_REDIRECT_URI } from "@/lib/local-origin";
import { YOTO_SCOPES } from "@/lib/yoto-icons";

const SCOPES = YOTO_SCOPES.split(" ");

export function SetupGuide({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="pk-card mx-auto max-w-3xl px-5 py-6 sm:px-8">
      <h2 className="font-display text-3xl">Set up Pokefacts</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Pokefacts runs on this computer. Leave the instruction window open while you use it.
      </p>
      <ol className="mt-5 grid gap-4 text-sm leading-6">
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
          <code className="break-all rounded bg-white px-1">{YOTO_REDIRECT_URI}</code>.
        </li>
        <li>
          <span className="font-bold">6. Allow these permissions.</span>{" "}
          {SCOPES.map((scope) => (
            <code key={scope} className="mr-1 inline-block break-all rounded bg-white px-1">
              {scope}
            </code>
          ))}
        </li>
        <li>
          <span className="font-bold">7. Connect Yoto.</span> Paste the client ID and sign in. Playlists show up in the
          Yoto app under Make Your Own. Link each one to a blank card.
        </li>
      </ol>
      <button
        type="button"
        className="mt-6 h-11 rounded-full border-[3px] border-ink bg-poke-red px-5 font-heading text-sm font-bold text-white shadow-[3px_3px_0_var(--ink)]"
        onClick={onConnect}
      >
        Connect Yoto
      </button>
    </section>
  );
}
