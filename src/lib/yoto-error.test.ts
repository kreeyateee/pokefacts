import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { prepareFactTrack } from "./yoto-fact-audio";
import { bulkFailureText } from "./yoto-send";
import {
  authorizeSearchParams,
  callbackForOrigin,
  clearSavedLoginForScopeGap,
  redirectUri,
  SESSION_KEY,
  YOTO_REDIRECT_URI,
} from "./yoto-session";
import { YOTO_SCOPES } from "./yoto-icons";
import {
  RECONNECT_YOTO,
  savedCardIsGone,
  statusErrorText,
  validYotoCardId,
  yotoErrorText,
  yotoUpstreamFailure,
} from "./yoto-error";

describe("Yoto errors", () => {
  it("reads a nested error message instead of a vague status line", () => {
    const text = yotoErrorText(
      {
        message: "Request failed with status code 400",
        error: { code: "bad-request", message: "Card ab12c does not exist." },
      },
      "Yoto did not accept this card.",
    );
    assert.match(text, /Card ab12c does not exist/);
    assert.match(text, /bad-request/);
  });

  it("keeps a five-character card id and retries when that playlist was deleted", () => {
    assert.equal(validYotoCardId("ab12C"), "ab12C");
    assert.equal(validYotoCardId("card-meet"), undefined);
    assert.equal(validYotoCardId("too-long"), undefined);
    assert.equal(
      savedCardIsGone(400, { message: "Request failed with status code 400" }),
      true,
    );
    assert.equal(savedCardIsGone(404, { error: { message: "Card ab12C does not exist." } }), true);
    assert.equal(savedCardIsGone(400, { error: { message: "Title is too long." } }), false);
  });

  it("keeps Yoto's raw body when the only message is a status code", () => {
    const raw = JSON.stringify({ message: "Request failed with status code 400" });
    const failure = yotoUpstreamFailure(raw);
    assert.equal(failure.yotoBody, raw);
    assert.match(failure.message, /Request failed with status code 400/);
    assert.match(failure.error, /Request failed with status code 400/);
    const shown = yotoErrorText(failure, "Yoto did not accept this card.");
    assert.match(shown, /Request failed with status code 400/);
    assert.match(shown, /\{"message":"Request failed with status code 400"\}/);
  });

  it("sends the public PKCE login back to this computer", () => {
    assert.equal(YOTO_REDIRECT_URI, "http://127.0.0.1:3847/callback");
    assert.equal(redirectUri(), YOTO_REDIRECT_URI);
    const params = authorizeSearchParams({
      clientId: "public-client",
      challenge: "challenge",
      redirectUri: redirectUri(),
    });
    assert.equal(params.get("redirect_uri"), "http://127.0.0.1:3847/callback");
    assert.equal(
      callbackForOrigin("https://pokefacts.duckdns.org"),
      "https://pokefacts.duckdns.org/callback",
    );
    assert.equal(callbackForOrigin("http://pokefacts.duckdns.org"), YOTO_REDIRECT_URI);
    assert.equal(callbackForOrigin("https://evil.example"), YOTO_REDIRECT_URI);
    assert.equal(callbackForOrigin("http://127.0.0.1:3847"), YOTO_REDIRECT_URI);
    assert.equal(params.get("code_challenge_method"), "S256");
    assert.equal(params.get("response_type"), "code");
    assert.equal(params.get("scope"), YOTO_SCOPES);
    for (const scope of [
      "user:content:manage",
      "user:content:view",
      "user:icons:manage",
      "family:library:view",
      "offline_access",
      "profile",
    ]) {
      assert.match(params.get("scope") ?? "", new RegExp(`(?:^|\\s)${scope}(?:\\s|$)`));
    }
  });

  it("clears the saved login when a content read lacks scopes the authorize URL already requests", async () => {
    const scope =
      authorizeSearchParams({
        clientId: "public-client",
        challenge: "challenge",
        redirectUri: "https://champdex.example/callback",
      }).get("scope") ?? "";
    assert.equal(scope, YOTO_SCOPES);
    assert.match(scope, /(?:^|\s)user:content:view(?:\s|$)/);
    assert.match(scope, /(?:^|\s)family:library:view(?:\s|$)/);

    const raw = "User does not have required scope(s): 'user:content:view', 'family:library:view'";
    const dir = await mkdtemp(path.join(tmpdir(), "champdex-scope-"));
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.startsWith("https://labs.api.yotoplay.com/content/job/")) {
        return Response.json({
          job: { jobId: "job-line-1", status: "completed", result: { cardId: "abc12" } },
        });
      }
      if (url.startsWith("https://api.yotoplay.com/content/abc12")) {
        return Response.json({ message: raw }, { status: 403 });
      }
      throw new Error(`Unexpected ${url}`);
    };
    const store = new Map<string, string>([
      [SESSION_KEY, JSON.stringify({ accessToken: "t".repeat(24), clientId: "public-client", expiresAt: 1 })],
    ]);
    const storage = {
      removeItem(key: string) {
        store.delete(key);
      },
    };

    try {
      await assert.rejects(
        () =>
          prepareFactTrack(
            "t".repeat(24),
            { text: "Bulbasaur waits in the tall grass.", title: "Bulbasaur", dexId: 1, speechJobId: "job-line-1" },
            fetchImpl,
            { speech: path.join(dir, "speech"), rendered: path.join(dir, "rendered") },
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, RECONNECT_YOTO);
          assert.equal(error.message.includes("user:content:view"), false);
          assert.equal(error.message.includes("family:library:view"), false);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    assert.equal(urls.some((url) => url.includes("/content/mine")), false);
    assert.equal(urls.some((url) => url.includes("/card/family/library")), false);
    assert.equal(
      urls.some((url) => url.startsWith("https://api.yotoplay.com/content/abc12")),
      true,
    );

    const cleared = clearSavedLoginForScopeGap(raw, storage);
    assert.equal(cleared, RECONNECT_YOTO);
    assert.equal(store.has(SESSION_KEY), false);

    const shown = bulkFailureText({
      headline: "Recording Pokefacts 1 of 11",
      rangeLabel: "Pokefacts 1 (1-99)",
      reason: raw,
      createdTitles: [],
      playlistIndex: 1,
    });
    assert.equal(shown, RECONNECT_YOTO);
    assert.equal(shown.includes("user:content:view"), false);
    assert.equal(shown.includes("Retry when you are ready"), false);
    assert.equal(shown.includes("already in your library"), false);
    assert.equal(shown.includes("failed"), false);
    const later = bulkFailureText({
      headline: "Recording Pokefacts 2 of 11",
      rangeLabel: "Pokefacts 2 (100-198)",
      reason: raw,
      createdTitles: ["Pokefacts 1"],
      playlistIndex: 2,
    });
    assert.equal(later.includes("already in your library"), false);
    assert.equal(statusErrorText(403, { message: raw, yotoBody: raw }, "Yoto did not accept this card."), RECONNECT_YOTO);
    const upstream = yotoUpstreamFailure(JSON.stringify({ message: raw }));
    assert.equal(upstream.message, RECONNECT_YOTO);
    assert.equal(upstream.yotoBody, "");
  });

  it("turns a 502 HTML body into a short timeout", () => {
    const html =
      "<!DOCTYPE html><html><head><title>trycloudflare.com | 502: Bad gateway</title></head><body>Error code 502</body></html>";
    const text = statusErrorText(502, { message: html }, "Yoto did not accept this card.");
    assert.match(text, /The public link timed out or the server was unreachable\. Retry\./);
    assert.equal(text.includes("<!DOCTYPE"), false);
    assert.equal(text.includes("already in your library"), false);
    const failure = yotoUpstreamFailure(html);
    assert.match(failure.message, /public link timed out/);
    assert.equal(failure.message.includes("<!DOCTYPE"), false);
    assert.equal(failure.yotoBody.includes("<!DOCTYPE"), false);
  });
});
