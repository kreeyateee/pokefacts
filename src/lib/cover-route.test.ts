import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST } from "../app/api/yoto/cover/route";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const AUTH = { Authorization: `Bearer ${"x".repeat(24)}` };
const IMAGE_L = "https://card-content.yotoplay.com/yoto/cover-abc";

function cover(body: BodyInit, type: string) {
  return POST(
    new Request("http://localhost/api/yoto/cover", { method: "POST", headers: { ...AUTH, "Content-Type": type }, body }),
  );
}

describe("cover route", () => {
  it("uploads the cover the page drew, with the playlist's name on it", async () => {
    const original = globalThis.fetch;
    let sent: { url: string; bytes: number; type: string | null } | null = null;
    globalThis.fetch = async (input, init) => {
      sent = {
        url: String(input),
        bytes: (init?.body as Uint8Array).length,
        type: new Headers(init?.headers).get("content-type"),
      };
      return Response.json({ coverImage: { mediaUrl: IMAGE_L } });
    };
    try {
      const response = await cover(new Uint8Array(PNG), "image/png");
      const upload = sent as { url: string; bytes: number; type: string | null } | null;
      assert.equal(upload?.bytes, PNG.length);
      assert.equal(upload?.type, "image/png");
      assert.match(upload?.url ?? "", /filename=pokefacts-cover&|filename=pokefacts-cover$/);
      assert.notEqual(response.status, 400);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a body that is not a PNG, or no login", async () => {
    const notPng = await cover(new Uint8Array(Buffer.from("<svg></svg>")), "image/png");
    assert.equal(notPng.status, 400);
    assert.match(JSON.stringify(await notPng.json()), /not a PNG Pokefacts drew/);
    const anonymous = await POST(new Request("http://localhost/api/yoto/cover", { method: "POST", body: PNG }));
    assert.equal(anonymous.status, 401);
  });

  it("still takes a bare picture by number from older pages", async () => {
    const response = await POST(new Request("http://localhost/api/yoto/cover?id=abc", { method: "POST", headers: AUTH }));
    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /not cover art/);
  });
});
