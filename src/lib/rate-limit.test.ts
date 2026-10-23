import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { budgetFor, RateLimiter, visitorOf } from "./rate-limit";

describe("rate limit", () => {
  it("lets a visitor use their budget, then asks them to wait until the minute is up", () => {
    const limiter = new RateLimiter({ page: 3, other: 5 }, 60_000);
    for (let index = 0; index < 3; index += 1) assert.equal(limiter.take("a", "page", 1_000), 0);
    assert.equal(limiter.take("a", "page", 1_000), 60);
    assert.equal(limiter.take("a", "page", 31_000), 30);
    assert.equal(limiter.take("b", "page", 31_000), 0, "another visitor has their own budget");
    assert.equal(limiter.take("a", "other", 31_000), 0, "pages and the rest are counted apart");
    assert.equal(limiter.take("a", "page", 61_000), 0, "a new minute starts again");
  });

  it("counts app data and prefetches with the API, and everything else as a page", () => {
    const none = new Headers();
    assert.equal(budgetFor("/api/yoto/track", none), "other");
    assert.equal(budgetFor("/_next/data/x.json", none), "other");
    assert.equal(budgetFor("/help", new Headers({ rsc: "1" })), "other");
    assert.equal(budgetFor("/help", none, "?_rsc=abc"), "other");
    assert.equal(budgetFor("/.env", none), "page");
    assert.equal(budgetFor("/", none), "page");
  });

  it("trusts the address Caddy added last", () => {
    assert.equal(visitorOf(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" })), "1.2.3.4");
    assert.equal(visitorOf(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
    assert.equal(visitorOf(new Headers()), "local");
  });
});
