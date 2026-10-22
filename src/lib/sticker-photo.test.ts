import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PHOTO_COLOR_ORDER, PHOTO_MAX_SHARE, PHOTO_MIN_SHARE, groupPhoto, photoOrder } from "./sticker-photo";

const W = 48.8;
const H = 61;

function member(key: string, heightDm: number, aspect = 1, color?: string) {
  return { key, heightDm, aspect, color };
}

describe("group photo", () => {
  it("is empty with nobody in it", () => {
    assert.deepEqual(groupPhoto([], W, H), []);
  });

  it("puts the tallest first and keeps the card order for equal heights", () => {
    const order = photoOrder([member("a", 4), member("b", 20), member("c", 4), member("d", 7)]);
    assert.deepEqual(
      order.map((item) => item.key),
      ["b", "d", "a", "c"],
    );
  });

  it("draws everyone to their real height next to each other", () => {
    const photo = groupPhoto([member("big", 20), member("small", 10)], W, H);
    const big = photo.find((item) => item.key === "big");
    const small = photo.find((item) => item.key === "small");
    assert.ok(big && small);
    assert.ok(Math.abs(big.height / small.height - 2) < 0.001);
    assert.ok(big.height <= H * PHOTO_MAX_SHARE + 0.001);
  });

  it("keeps the tiniest big enough to find", () => {
    const photo = groupPhoto([member("wailord", 145), member("joltik", 1)], W, H);
    const [tall, tiny] = photo;
    assert.ok(tall && tiny);
    assert.ok(Math.abs(tiny.height / tall.height - PHOTO_MIN_SHARE) < 0.001);
  });

  it("fits an absurd pile of 99 inside the photo, back rows tallest", () => {
    const crowd = Array.from({ length: 99 }, (_, index) => member(`m${index}`, 1 + ((index * 37) % 60), 0.7 + (index % 5) * 0.2));
    const photo = groupPhoto(crowd, W, H);
    assert.equal(photo.length, 99);
    for (const item of photo) {
      assert.ok(item.baseline - item.height >= -0.001, `${item.key} pokes out of the top`);
      assert.ok(item.baseline <= H + 0.001, `${item.key} stands below the photo`);
      assert.ok(item.x - item.width / 2 >= -0.001 && item.x + item.width / 2 <= W + 0.001, `${item.key} pokes out of the side`);
    }
    const rows = Math.max(...photo.map((item) => item.row));
    assert.ok(rows >= 2, "a big crowd stands in several rows");
    const tallestIn = (row: number) => Math.max(...photo.filter((item) => item.row === row).map((item) => item.height));
    for (let row = 1; row <= rows; row += 1) assert.ok(tallestIn(row) <= tallestIn(row - 1) + 0.001);
    const baseline = (row: number) => photo.find((item) => item.row === row)?.baseline ?? 0;
    for (let row = 1; row <= rows; row += 1) assert.ok(baseline(row) > baseline(row - 1), "rows in front stand lower");
  });

  it("groups each row by colour in rainbow order, then by height", () => {
    const wide = groupPhoto(
      [member("b1", 10, 1, "blue"), member("r1", 9, 1, "red"), member("g1", 10, 1, "green"), member("r2", 10, 1, "red")],
      400,
      H,
    );
    assert.deepEqual(
      wide.sort((a, b) => a.x - b.x).map((item) => item.key),
      ["r2", "r1", "g1", "b1"],
    );
    const colours = ["blue", "red", "green", "yellow", "black", "pink"];
    const crowd = Array.from({ length: 60 }, (_, index) => member(`m${index}`, 2 + (index % 9), 1, colours[index % colours.length]));
    const photo = groupPhoto(crowd, W, H);
    const rank = (key: string) => PHOTO_COLOR_ORDER.indexOf(crowd.find((item) => item.key === key)?.color as never);
    for (const row of new Set(photo.map((item) => item.row))) {
      const ranks = photo
        .filter((item) => item.row === row)
        .sort((a, b) => a.x - b.x)
        .map((item) => rank(item.key));
      assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b), `row ${row} is not in rainbow order`);
    }
  });

  it("caps a long giant at the photo's width instead of shrinking everyone", () => {
    const crowdOf = (giantAspect: number) =>
      groupPhoto([member("rayquaza", 70, giantAspect), ...Array.from({ length: 20 }, (_, index) => member(`m${index}`, 10))], W, H);
    const narrow = crowdOf(1).find((item) => item.key === "m0");
    const wide = crowdOf(3).find((item) => item.key === "m0");
    assert.ok(narrow && wide);
    assert.ok(wide.height > narrow.height * 0.8, `a wide giant shrank the rest from ${narrow.height} to ${wide.height}`);
    const giant = crowdOf(3).find((item) => item.key === "rayquaza");
    assert.ok(giant && giant.width <= W * 0.9 + 0.001);
  });

  it("measures against nearly the tallest, so one giant doesn't shrink the whole class", () => {
    const class20 = Array.from({ length: 20 }, (_, index) => member(`m${index}`, 10 + (index % 5)));
    const without = groupPhoto(class20, W, H).find((item) => item.key === "m0");
    const withGiant = groupPhoto([member("rayquaza", 108), ...class20], W, H);
    const m0 = withGiant.find((item) => item.key === "m0");
    const giant = withGiant.find((item) => item.key === "rayquaza");
    assert.ok(without && m0 && giant);
    assert.ok(m0.height > without.height * 0.6, "the class stays a good size next to a giant");
    assert.ok(giant.height > m0.height, "the giant is still the biggest");
  });
});
