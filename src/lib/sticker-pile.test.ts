import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { maskFromAlpha, pileCoverage, pilePhoto, pileSeed, type PileMember, type PilePlacement } from "./sticker-pile";

const W = 48.8;
const H = 61.4;
/** The real pile area on the card. */
const CARD_W = 52.4;
const CARD_H = 73.8;
const EPS = 0.001;

type Shape = "circle" | "l" | "peak";

/** RGBA pixels of a shape on a clear background, the way a canvas hands them over. */
function shapePixels(shape: Shape, width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const inside =
        shape === "circle"
          ? (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25
          : shape === "l"
            ? u < 0.45 || v > 0.55
            : Math.abs(u - 0.5) <= v / 2;
      rgba[(y * width + x) * 4 + 3] = inside ? 255 : 0;
    }
  }
  return rgba;
}

function shapeMask(shape: Shape, aspect: number) {
  const height = 120;
  const width = Math.round(height * aspect);
  return maskFromAlpha(shapePixels(shape, width, height), width, height);
}

/** Plain boxes, one giant and lots of small ones. */
function crowd(count: number): PileMember[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `m${index}`,
    heightDm: index === 0 ? 145 : 2 + ((index * 13) % 25),
    aspect: 0.7 + (index % 4) * 0.25,
  }));
}

/** A poster-like cast with shapes: an upright giant, a long one, and a crowd of small ones. */
function poster(count: number): PileMember[] {
  const shapes: Shape[] = ["circle", "l", "peak"];
  return Array.from({ length: count }, (_, index) => {
    const heightDm = index === 0 ? 145 : index === 1 ? 70 : index === 2 ? 35 : 3 + ((index * 7) % 18);
    const aspect = index === 0 ? 0.75 : index === 1 ? 1.6 : 0.7 + ((index * 5) % 8) * 0.1;
    const shape = shapes[index % shapes.length];
    return { key: `p${index}`, heightDm, aspect, mask: shapeMask(shape, aspect) };
  });
}

/** The box a placement takes once it is turned. */
function turnedBox(item: PilePlacement) {
  const cos = Math.abs(Math.cos(item.rotation));
  const sin = Math.abs(Math.sin(item.rotation));
  const w = item.width * cos + item.height * sin;
  const h = item.width * sin + item.height * cos;
  return { left: item.cx - w / 2, top: item.cy - h / 2, right: item.cx + w / 2, bottom: item.cy + h / 2 };
}

function assertInside(pile: PilePlacement[], width: number, height: number) {
  for (const item of pile) {
    const box = turnedBox(item);
    assert.ok(box.left >= -EPS && box.top >= -EPS, `${item.key} pokes out of the top or left`);
    assert.ok(box.right <= width + EPS && box.bottom <= height + EPS, `${item.key} pokes out`);
    assert.ok(Math.abs(item.x - (item.cx - item.width / 2)) < EPS && Math.abs(item.y - (item.cy - item.height / 2)) < EPS);
  }
}

describe("pile masks", () => {
  it("builds a coarse mask with its longest side at the resolution", () => {
    const mask = maskFromAlpha(shapePixels("circle", 200, 100), 200, 100, 48);
    assert.equal(mask.width, 48);
    assert.equal(mask.height, 24);
    assert.equal(mask.data[12 * 48 + 24], 1, "the middle is opaque");
    assert.equal(mask.data[0], 0, "the corner is clear");
    const small = maskFromAlpha(shapePixels("l", 10, 20), 10, 20, 48);
    assert.equal(small.height, 48);
    assert.equal(small.data[0], 1, "top-left of the L is opaque");
    assert.equal(small.data[small.width - 1], 0, "top-right of the L is clear");
  });
});

describe("pile collage", () => {
  it("is empty with nobody in it", () => {
    assert.deepEqual(pilePhoto([], W, H, 1), []);
  });

  it("puts everyone on the card exactly once, biggest first, inside the area", () => {
    for (const members of [crowd(99), poster(99)]) {
      const pile = pilePhoto(members, W, H, pileSeed("meet-1"));
      assert.equal(pile.length, 99, "no copies");
      assert.equal(new Set(pile.map((item) => item.key)).size, 99);
      assert.equal(pile[0]?.key, members[0].key);
      assertInside(pile, W, H);
    }
  });

  it("keeps real heights apart", () => {
    const pile = pilePhoto(crowd(30), W, H, 7);
    const big = pile.find((item) => item.key === "m0");
    const small = pile.find((item) => item.key === "m1");
    assert.ok(big && small);
    assert.ok(big.height > small.height * 3);
  });

  it("keeps relative sizes true to the Pokédex above the floor", () => {
    const members = poster(99);
    const pile = pilePhoto(members, CARD_W, CARD_H, 5);
    const firsts = new Map(pile.map((item) => [item.key, item]));
    const floor = Math.min(...[...firsts.values()].map((item) => item.height));
    const sized = members.filter((member) => member.heightDm <= 35 && (firsts.get(member.key)?.height ?? 0) > floor * 1.05);
    assert.ok(sized.length >= 2);
    const ratios = sized.map((member) => (firsts.get(member.key)?.height ?? 0) / member.heightDm);
    for (const ratio of ratios) assert.ok(Math.abs(ratio - ratios[0]) < 1e-6, "one scale for everyone above the floor");
  });

  it("gives the same pile for the same seed and a different one for another", () => {
    for (const members of [crowd(20), poster(40)]) {
      assert.deepEqual(pilePhoto(members, W, H, 42), pilePhoto(members, W, H, 42));
      assert.notDeepEqual(pilePhoto(members, W, H, 42), pilePhoto(members, W, H, 43));
    }
    assert.notEqual(pileSeed("meet-1"), pileSeed("meet-2"));
  });

  it("turns some pictures to fit them in", () => {
    const pile = pilePhoto(poster(99), CARD_W, CARD_H, pileSeed("turns"));
    const turned = pile.filter((item) => Math.abs(item.rotation) > 1e-9);
    assert.ok(turned.length > 0, "at least one picture is turned");
    assert.ok(turned.length < pile.length, "and not all of them");
  });

  it("grows everyone as big as they can be, so the card is mostly picture", () => {
    for (const seed of [1, 2, 3]) {
      const members = poster(99);
      const pile = pilePhoto(members, CARD_W, CARD_H, seed);
      const coverage = pileCoverage(members, pile, CARD_W, CARD_H);
      console.log(`seed ${seed}: ${pile.length} pictures cover ${(coverage * 100).toFixed(1)}% of the card`);
      assert.ok(coverage >= 0.5, `only ${(coverage * 100).toFixed(1)}% covered`);
    }
  });

  it("makes the giant as big as the card allows", () => {
    // The old packer drew the tallest at a third of the area's height.
    const naive = CARD_H * 0.34;
    for (const count of [30, 99]) {
      const members = poster(count);
      const pile = pilePhoto(members, CARD_W, CARD_H, 9);
      const giant = pile.find((item) => item.key === "p0");
      assert.ok(giant);
      // Upright, the widest it can be is the area's width.
      const most = Math.min(CARD_H, CARD_W / members[0].aspect);
      console.log(`${count} on the card: giant ${giant.height.toFixed(1)} mm of at most ${most.toFixed(1)} mm`);
      assert.equal(giant.rotation, 0, "upright");
      assert.ok(giant.height > naive * 1.5, "much bigger than before");
      for (const item of pile) if (item !== giant) assert.ok(item.height < giant.height);
      // With few others it nearly fills the card; with 99 at true scale the others need room too.
      if (count === 30) assert.ok(giant.height >= most * 0.8, "close to the full height");
    }
  });

  it("lays a long giant on its side when that makes it much bigger", () => {
    const members = poster(60);
    members[0] = { ...members[0], aspect: 2.2, mask: shapeMask("circle", 2.2) };
    const pile = pilePhoto(members, CARD_W, CARD_H, 4);
    const giant = pile.find((item) => item.key === "p0");
    assert.ok(giant);
    const standing = CARD_W / 2.2;
    console.log(`long giant: ${giant.height.toFixed(1)} mm turned ${giant.rotation.toFixed(2)}, standing it could be ${standing.toFixed(1)} mm`);
    assert.ok(Math.abs(giant.rotation - Math.PI / 2) < 1e-9, "on its side");
    assert.ok(giant.height > standing * 1.2);
    assert.ok(giant.width >= CARD_H * 0.8, "nearly the full height of the card");
  });

  it("is quick enough to draw in a browser", () => {
    const members = poster(99);
    pilePhoto(members, CARD_W, CARD_H, 1);
    const times: number[] = [];
    for (const seed of [21, 22, 23, 24, 25]) {
      const start = performance.now();
      pilePhoto(members, CARD_W, CARD_H, seed);
      times.push(performance.now() - start);
    }
    const plain = performance.now();
    pilePhoto(crowd(99), CARD_W, CARD_H, 3);
    const plainTime = performance.now() - plain;
    console.log(`pile of 99: ${times.map((time) => time.toFixed(0)).join(", ")} ms with masks; ${plainTime.toFixed(0)} ms with boxes`);
    assert.ok(Math.max(...times) < 1000, "takes too long");
  });
});
