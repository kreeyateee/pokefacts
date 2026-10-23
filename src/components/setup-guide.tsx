"use client";

import { LOCAL_APP_ORIGIN, YOTO_REDIRECT_URI } from "@/lib/local-origin";
import { YOTO_AUTO_SCOPES, YOTO_TICK_SCOPES } from "@/lib/yoto-icons";

function Chips({ scopes }: { scopes: readonly string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <code key={scope} className="break-all rounded bg-white px-1">
          {scope}
        </code>
      ))}
    </span>
  );
}

/** Which Scopes boxes to tick on the Yoto dashboard, and which ones it then ticks by itself. */
export function ScopeList() {
  return (
    <span className="mt-1 block">
      <span className="block font-bold">Tick these two:</span>
      <Chips scopes={YOTO_TICK_SCOPES} />
      <span className="mt-1 block">
        Yoto then ticks these by itself (&ldquo;Included automatically&rdquo;). If one isn&apos;t ticked, tick it:
      </span>
      <Chips scopes={YOTO_AUTO_SCOPES} />
    </span>
  );
}

export function SetupGuide({
  onConnect,
  onHome,
}: {
  onConnect: () => void;
  onHome?: () => void;
}) {
  return (
    <section className="pk-card mx-auto max-w-3xl px-5 py-6 sm:px-8">
      <h2 className="font-display text-2xl leading-tight text-balance sm:text-3xl">
        Link Pokefacts to your Yoto
      </h2>
      <p className="mt-2 text-base leading-7">
        This is for the grown-up who owns the Yoto. Your child does not need to do any of
        this. You will sign in once, send a playlist from this website, then stick that
        playlist onto a blank Make Your Own card in the Yoto app.
      </p>

      <h3 className="pk-kicker mt-6">What you need</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-base leading-7">
        <li>A Yoto player and the Yoto app on your phone</li>
        <li>The Yoto account you already use in that app</li>
        <li>At least one blank Make Your Own card</li>
        <li>About five minutes the first time</li>
      </ul>

      <ol className="mt-6 grid gap-5 text-base leading-7">
        <li>
          <span className="font-bold">1. Tell Yoto this website may send cards.</span>{" "}
          Yoto does not let a website use your password. Instead, Yoto asks you to make a
          free “public app” on their site. That is not programming. It is a permission slip
          with a long ID.
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
            <li>
              On a phone or computer, open{" "}
              <a
                className="font-bold text-poke-red underline decoration-2"
                href="https://dashboard.yoto.dev/"
                target="_blank"
                rel="noreferrer"
              >
                dashboard.yoto.dev
              </a>{" "}
              and sign in with the same Yoto account.
            </li>
            <li>Choose to create a public app. There is no secret code to invent.</li>
            <li>
              In the app&apos;s Scopes list, give Pokefacts the access it needs to make playlists and their icons.{" "}
              <code className="rounded bg-white px-1">offline_access</code> keeps it signed in while a long playlist
              records. Without these, Yoto turns the login away. The other boxes are not needed. Then tap Update
              Application.
              <ScopeList />
            </li>
            <li>
              Copy the long Client ID. It looks like a jumble of letters and numbers.
            </li>
          </ol>
        </li>
        <li>
          <span className="font-bold">2. Connect on this website.</span> Tap Connect Yoto
          below. Paste that long ID, then continue. Yoto will ask you to allow Pokefacts to
          make playlists in your library. Say yes. Pokefacts never sees your password.
        </li>
        <li>
          <span className="font-bold">3. Send a playlist.</span> Start with Fact Cards if
          you are new. Tap Create card, pick a voice if you like, then confirm. Recording
          keeps going in the background. A bar at the bottom of the screen tells you when
          it is done. If you close the page, it carries on next time you open Pokefacts.
        </li>
        <li>
          <span className="font-bold">4. Put it on a blank card.</span> A Make Your Own
          card window opens as soon as the send starts. You can also open it while you
          build a playlist. In the Yoto app, choose Link to a card, then hold a blank
          Make Your Own card to the player. The next playlist needs another blank card.
          Paper stickers are optional, and they come after this step.
        </li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="h-11 rounded-full border-[3px] border-ink bg-poke-red px-5 font-heading text-sm font-bold text-white shadow-[3px_3px_0_var(--ink)]"
          onClick={onConnect}
        >
          Connect Yoto
        </button>
        {onHome ? (
          <button
            type="button"
            className="h-11 rounded-full border-[3px] border-ink bg-white px-5 font-heading text-sm font-bold text-ink shadow-[3px_3px_0_var(--ink)]"
            onClick={onHome}
          >
            Start with Fact Cards
          </button>
        ) : null}
      </div>

      <h3 className="pk-kicker mt-8">Where to look</h3>
      <ul className="mt-2 grid gap-2 text-sm leading-6">
        <li>
          <span className="font-bold">Ready-made</span> — finished playlists. Pick a set (Facts,
          Who&apos;s That, Starters, Jokes, Mega, Gigantamax, Alolan, Hisuian, Legendary, or Mythical), then a
          playlist. Facts is a good place to start.
        </li>
        <li>
          <span className="font-bold">Make your own</span> — browse the Pokédex, tick your own
          list, then send it.
        </li>
        <li>
          <span className="font-bold">Music</span> — songs from the games.
        </li>
      </ul>

      <details className="mt-6 text-sm leading-6">
        <summary className="cursor-pointer font-bold">If something goes wrong</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Use the same Yoto account in the app and on dashboard.yoto.dev.</li>
          <li>
            If Connect does nothing, copy the return address from the Connect window into
            the Yoto app settings, then try again.
          </li>
          <li>
            After a send, the playlist is in Make Your Own in the Yoto app. It is not on
            the plastic card until you link it.
          </li>
        </ul>
      </details>

      <details className="mt-4 text-sm leading-6">
        <summary className="cursor-pointer font-bold">
          If you run Pokefacts on your own computer
        </summary>
        <ol className="mt-4 grid gap-4">
          <li>
            <span className="font-bold">1. Install Node.js 22.14 or newer.</span> Pokefacts
            will not start on an older Node.
          </li>
          <li>
            <span className="font-bold">2. Install ffmpeg.</span> On Windows, in a new
            command window:{" "}
            <code className="rounded bg-white px-1">winget install Gyan.FFmpeg</code>.
            ffmpeg joins the cry to the voice.
          </li>
          <li>
            <span className="font-bold">3. Install and start.</span> In the Pokefacts
            folder, run <code className="rounded bg-white px-1">npm install</code>, then{" "}
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
            <a
              className="font-bold text-poke-red underline"
              href="https://dashboard.yoto.dev/"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.yoto.dev
            </a>{" "}
            choose public. There is no client secret. Set the redirect to exactly{" "}
            <code className="break-all rounded bg-white px-1">{YOTO_REDIRECT_URI}</code>.
          </li>
          <li>
            <span className="font-bold">6. Tick the scopes.</span> All of these must be on, or Yoto turns the
            login away. If you already connected, reconnect so the new permissions are included.
            <ScopeList />
          </li>
          <li>
            <span className="font-bold">7. Connect Yoto.</span> Paste the client ID and
            sign in. Leave this window open while a playlist is recording.
          </li>
        </ol>
      </details>
    </section>
  );
}
