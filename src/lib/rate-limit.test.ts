import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import { config, proxy } from "../proxy";
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

  it("never limits a card send, however many Yoto requests it makes", () => {
    const from = { headers: { "x-forwarded-for": "7.7.7.7" } };
    for (let index = 0; index < 5_000; index += 1) {
      const path = ["/api/yoto/job/abc", "/api/yoto/track", "/api/yoto/icon"][index % 3];
      assert.notEqual(proxy(new NextRequest(`http://localhost${path}`, from)).status, 429);
    }
    assert.match(config.matcher[0] ?? "", /api\/yoto\//, "the Yoto routes skip the proxy entirely");
  });

  it("does limit someone hammering other routes", () => {
    const from = { headers: { "x-forwarded-for": "6.6.6.6" } };
    const statuses = Array.from({ length: 60 }, (_, index) =>
      proxy(new NextRequest(`http://localhost/.env${index}`, from)).status,
    );
    assert.equal(statuses.indexOf(429), 40);
  });
});
