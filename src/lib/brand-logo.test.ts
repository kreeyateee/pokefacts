import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BRAND_IMAGE_KEY, BRAND_LOGO } from "./brand-logo";

describe("Pokefacts logo files", () => {
  it("keeps a vertical, horizontal, and compact lockup", () => {
    assert.equal(BRAND_LOGO.vertical, "/brand/logo-vertical.png");
    assert.equal(BRAND_LOGO.horizontal, "/brand/logo-horizontal.png");
    assert.equal(BRAND_LOGO.compact, "/brand/logo-compact.png");
    assert.equal(BRAND_LOGO.mark, "/brand/logo-mark.png");
    assert.equal(BRAND_IMAGE_KEY.compact, "brand:compact");
  });
});
