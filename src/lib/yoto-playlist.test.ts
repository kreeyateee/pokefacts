import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coverArtworkId, type KidCard } from "./kid-cards";
import { applyPlaylistCover, appendToPlaylist, contentCreateBody } from "./yoto-send";
import { isYotoCoverUrl, yotoCoverImageL, yotoPlaylistUrl } from "./yoto-playlist";

const icon = "yoto:#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function audioChapter() {
  return {
    key: "ch",
    title: "Pikachu",
    display: { icon16x16: icon },
    tracks: [
      {
        key: "t",
        title: "Pikachu",
        trackUrl: "yoto:#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        type: "audio" as const,
        format: "mp3",
        channels: "mono" as const,
        duration: 8,
        fileSize: 1200,
        display: { icon16x16: icon },
      },
    ],
  };
}

function card(chapters: KidCard["chapters"]): KidCard {
  return {
    id: "meet-1",
    kind: "meet",
    title: "Facts",
    rangeLabel: "1-1",
    libraryTitle: "Pokefacts 1",
    blurb: "One.",
    childDoes: "Play.",
    chapters,
  };
}

describe("Yoto playlist link", () => {
  it("opens a five-character playlist in the Yoto MYO app", () => {
    assert.equal(yotoPlaylistUrl("ab12C"), "https://my.yotoplay.com/card/ab12C");
    assert.equal(yotoPlaylistUrl("nope"), undefined);
    assert.equal(yotoPlaylistUrl(""), undefined);
  });
});

describe("playlist cover art", () => {
  it("uses the first Pokémon picture as the cover", () => {
    assert.equal(
      coverArtworkId(
        card([
          {
            key: "start",
            title: "How to",
            overlay: "Go",
            picture: "",
            mark: "",
            icon,
            tracks: [],
          },
          {
            key: "25",
            title: "Pikachu",
            overlay: "25",
            picture: "",
            mark: "",
            icon: "/pixels/25.png",
            dexId: 25,
            tracks: [],
          },
        ]),
      ),
      25,
    );
    assert.equal(
      coverArtworkId(
        card([
          {
            key: "mega",
            title: "Mega Venusaur",
            overlay: "3",
            picture: "",
            mark: "",
            icon: "/api/artwork/form/10033",
            dexId: 3,
            formId: 10033,
            tracks: [],
          },
        ]),
      ),
      10033,
    );
    assert.equal(coverArtworkId(card([])), undefined);
  });

  it("reads the CDN URL Yoto returns after a cover upload", () => {
    assert.equal(
      yotoCoverImageL({ coverImage: { mediaUrl: "https://media-cdn.example/cover.png" } }),
      "https://media-cdn.example/cover.png",
    );
    assert.equal(yotoCoverImageL({ imageL: "https://media-cdn.example/cover.png" }), "https://media-cdn.example/cover.png");
    assert.equal(yotoCoverImageL({ coverImage: { mediaUrl: "yoto:#nope" } }), undefined);
  });

  it("keeps the cover URL on the body Yoto stores", () => {
    const upload = applyPlaylistCover(
      {
        voiceId: "pFZP5JQG7iQjIQuC4Bku",
        content: {
          title: "Pokefacts 1",
          metadata: { description: "Cry, then Lily." },
          content: { chapters: [audioChapter()] },
        },
      },
      "https://card-content.example/cover",
    );
    const created = contentCreateBody(upload.content);
    assert.equal(created.metadata?.cover?.imageL, "https://card-content.example/cover");
    assert.equal(Object.hasOwn(created.metadata ?? {}, "title"), false);
    assert.equal(isYotoCoverUrl("https://card-content.example/cover"), true);
    assert.equal(isYotoCoverUrl("javascript:alert(1)"), false);
    const skipped = applyPlaylistCover(upload, "javascript:alert(1)");
    assert.equal(skipped.content.metadata?.cover?.imageL, "https://card-content.example/cover");
  });

  it("keeps an existing cover when tracks are added", () => {
    const addition = applyPlaylistCover(
      {
        voiceId: "pFZP5JQG7iQjIQuC4Bku",
        content: {
          title: "More facts",
          metadata: { description: "More." },
          content: { chapters: [audioChapter()] },
        },
      },
      "https://card-content.example/new",
    );
    const merged = appendToPlaylist(
      {
        cardId: "ab12C",
        title: "Pokefacts 1",
        metadata: {
          description: "Cry, then Lily.",
          cover: { imageL: "https://card-content.example/old" },
        },
        content: { chapters: [audioChapter()] },
      },
      addition.content,
    );
    assert.equal(merged.metadata?.cover?.imageL, "https://card-content.example/old");
    const firstCover = appendToPlaylist(
      {
        cardId: "ab12C",
        title: "Pokefacts 1",
        metadata: { description: "Cry, then Lily." },
        content: { chapters: [audioChapter()] },
      },
      addition.content,
    );
    assert.equal(firstCover.metadata?.cover?.imageL, "https://card-content.example/new");
  });
});
