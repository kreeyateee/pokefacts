import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DONATE_URL } from "./site";
import {
  DONATE_LABEL,
  SEND_TOAST_ID,
  SEND_TOAST_MS,
  sendAllReadyCopy,
  sendCheerAction,
  sendReadyCopy,
  sendStartedCopy,
} from "./send-cheer";

describe("send cheer copy", () => {
  it("tells the parent the card is recording in the background", () => {
    assert.equal(
      sendStartedCopy("Pokefacts 1"),
      "Pokefacts 1 is recording in the background. Keep browsing.",
    );
    assert.match(sendStartedCopy("  "), /This playlist is recording in the background/);
  });

  it("cheers when a playlist is ready and invites a coffee", () => {
    assert.equal(
      sendReadyCopy("Pokefacts 1"),
      "Pokefacts 1 is ready to link. Fancy buying me a coffee?",
    );
    assert.equal(
      sendReadyCopy("Bedtime mix", true),
      "Bedtime mix was updated. Fancy buying me a coffee?",
    );
    assert.equal(
      sendAllReadyCopy(11),
      "All 11 Pokefacts playlists are ready to link. Fancy buying me a coffee?",
    );
  });

  it("points the coffee button at the existing tip jar", () => {
    assert.equal(DONATE_LABEL, "Buy me a coffee");
    assert.deepEqual(sendCheerAction(), { label: DONATE_LABEL, href: DONATE_URL });
    assert.match(DONATE_URL, /buymeacoffee\.com\/kreeyate/);
    assert.equal(SEND_TOAST_ID, "pokefacts-send");
    assert.ok(SEND_TOAST_MS >= 15_000);
  });
});
