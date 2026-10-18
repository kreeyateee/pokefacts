import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { savedCardIsGone, validYotoCardId, yotoErrorText } from "./yoto-error";

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
});
