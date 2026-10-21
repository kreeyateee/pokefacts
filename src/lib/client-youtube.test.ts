import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientAppCorsHeaders } from "./client-app-cors";
import {
  CLIENT_YOUTUBE_OFFLINE,
  clientYoutubeUrl,
  fetchClientYoutube,
  isClientApp,
  uploadedAudioError,
  youtubeStaysOnClient,
} from "./client-youtube";

const LOCAL = "http://127.0.0.1:3847";
const PUBLIC = "https://pokefacts.duckdns.org";

describe("client youtube", () => {
  it("keeps youtube on the client app and yoto on the page that is open", () => {
    assert.equal(isClientApp(LOCAL, LOCAL), true);
    assert.equal(clientYoutubeUrl(LOCAL, "/api/music/mp3", LOCAL), "/api/music/mp3");
    assert.equal(clientYoutubeUrl(PUBLIC, "/api/music/youtube?page=Song", LOCAL), `${LOCAL}/api/music/youtube?page=Song`);
    assert.equal(clientYoutubeUrl(PUBLIC, "api/music/mp3/jNQXAC9IVRw", LOCAL), `${LOCAL}/api/music/mp3/jNQXAC9IVRw`);
  });

  it("turns a failed client connection into the open-the-app message", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("connect refused"));
    try {
      await fetchClientYoutube(PUBLIC, "/api/music/mp3");
      assert.fail("expected the client app to be offline");
    } catch (error) {
      assert.equal(error instanceof Error ? error.message : "", CLIENT_YOUTUBE_OFFLINE);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("blocks server youtube only when that switch is set", () => {
    assert.equal(youtubeStaysOnClient({ ...process.env, YOUTUBE_DISABLED: "1" }), true);
    const enabled = { ...process.env };
    delete enabled.YOUTUBE_DISABLED;
    assert.equal(youtubeStaysOnClient(enabled), false);
  });

  it("rejects an empty upload and a video id that is not 11 characters", () => {
    assert.equal(uploadedAudioError(0, "jNQXAC9IVRw"), "That audio file was empty.");
    assert.equal(uploadedAudioError(32, "short"), "That YouTube video id does not look right.");
    assert.equal(uploadedAudioError(32 * 1024 * 1024 + 1, "jNQXAC9IVRw"), "That audio file is too large.");
    assert.equal(uploadedAudioError(32, "jNQXAC9IVRw"), null);
  });

  it("allows the public site to call the app on this computer", () => {
    const headers = clientAppCorsHeaders(new Request("http://127.0.0.1:3847/api/music/mp3", { headers: { Origin: PUBLIC } }));
    assert.equal(headers.get("Access-Control-Allow-Origin"), PUBLIC);
    assert.equal(headers.get("Access-Control-Allow-Private-Network"), "true");
    const blocked = clientAppCorsHeaders(
      new Request("http://127.0.0.1:3847/api/music/mp3", { headers: { Origin: "https://example.com" } }),
    );
    assert.equal(blocked.get("Access-Control-Allow-Origin"), null);
  });
});
