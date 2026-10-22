import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  movePlaylistItem,
  orderPlaylist,
  reversePlaylist,
  shiftPlaylistItem,
  type PlaylistMon,
} from "./playlist-order";

const line: PlaylistMon[] = [
  { id: 133, name: "Eevee" },
  { id: 134, name: "Vaporeon" },
  { id: 135, name: "Jolteon" },
  { id: 136, name: "Flareon" },
];

describe("playlist order", () => {
  it("drops a card onto another place and keeps the rest in order", () => {
    const moved = movePlaylistItem(line, 0, 2);
    assert.deepEqual(
      moved.map((item) => item.name),
      ["Vaporeon", "Jolteon", "Eevee", "Flareon"],
    );
    assert.deepEqual(
      movePlaylistItem(line, 3, 1).map((item) => item.id),
      [133, 136, 134, 135],
    );
    assert.deepEqual(movePlaylistItem(line, 1, 1), line);
    assert.deepEqual(movePlaylistItem(line, -1, 0), line);
    assert.deepEqual(movePlaylistItem(line, 0, 9), line);
  });

  it("steps one card earlier or later", () => {
    assert.deepEqual(
      shiftPlaylistItem(line, 2, -1).map((item) => item.name),
      ["Eevee", "Jolteon", "Vaporeon", "Flareon"],
    );
    assert.deepEqual(
      shiftPlaylistItem(line, 0, 1).map((item) => item.name),
      ["Vaporeon", "Eevee", "Jolteon", "Flareon"],
    );
    assert.equal(shiftPlaylistItem(line, 0, -1)[0]?.name, "Eevee");
    assert.equal(shiftPlaylistItem(line, 3, 1)[3]?.name, "Flareon");
  });

  it("orders the whole list by number, by name, or in reverse", () => {
    const shuffled = [line[2], line[0], line[3], line[1]].filter((item): item is PlaylistMon => Boolean(item));
    assert.deepEqual(
      orderPlaylist(shuffled, "number").map((item) => item.id),
      [133, 134, 135, 136],
    );
    assert.deepEqual(
      orderPlaylist(shuffled, "name").map((item) => item.name),
      ["Eevee", "Flareon", "Jolteon", "Vaporeon"],
    );
    assert.deepEqual(
      reversePlaylist(line).map((item) => item.name),
      ["Flareon", "Jolteon", "Vaporeon", "Eevee"],
    );
  });

  it("orders a form by its species number, just after that species", () => {
    const mixed: PlaylistMon[] = [
      { id: 10034, name: "Mega Charizard X", number: 6 },
      { id: 19, name: "Rattata" },
      { id: 10091, name: "Alolan Rattata", number: 19 },
      { id: 6, name: "Charizard" },
      { id: 4, name: "Charmander" },
    ];
    assert.deepEqual(
      orderPlaylist(mixed, "number").map((item) => item.id),
      [4, 6, 10034, 19, 10091],
    );
  });
});
