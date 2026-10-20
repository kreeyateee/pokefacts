import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  linksFromNavigation,
  musicHtml,
  musicLinkKind,
  navigationContentLinks,
  readMusicIndex,
  tracklistSongs,
  youtubeVideoId,
} from "./music";

const ENGLISH_CDS = `
<table>
  <tr><td>
    <table>
      <tr><th><a href="/wiki/List_of_Pok%C3%A9mon_music_CDs" title="List of Pokémon music CDs">English CDs</a></th></tr>
      <tr>
        <th>Singles:</th>
        <td>
          <a href="/wiki/Don%27t_Say_You_Love_Me_(single)" title="Don&#39;t Say You Love Me (single)">Don't Say You Love Me</a>
          • <a href="/wiki/Pok%C3%A9mon_X_(CD)" title="Pokémon X (CD)">Pokémon X</a>
          • <a href="/wiki/Pok%C3%A9mon_2.B.A._Master" title="Pokémon 2.B.A. Master">Pokémon 2.B.A. Master</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
`;

const OPENING_THEMES = `
<table>
  <tr>
    <th><a href="/wiki/List_of_English_opening_themes" title="List of English opening themes">English opening themes</a> of the <a href="/wiki/Pok%C3%A9mon_animated_series" title="Pokémon animated series">Pokémon animated series</a></th>
  </tr>
  <tr>
    <th><a href="/wiki/Original_series" title="Original series">Original series</a>:</th>
    <td><a href="/wiki/Pok%C3%A9mon_Theme" title="Pokémon Theme">Pokémon Theme</a> • <a href="/wiki/Pok%C3%A9mon_World_(song)" title="Pokémon World (song)">Pokémon World</a></td>
  </tr>
</table>
`;

const ALBUM_PAGE = `
<h2><span class="mw-headline" id="Tracklist">Tracklist</span></h2>
<table>
  <tr><th>No.</th><th>Track Title</th><th>Artist</th><th>Duration</th></tr>
  <tr>
    <td>1</td>
    <td><b><a href="/wiki/Pok%C3%A9mon_Theme" title="Pokémon Theme">Pokémon Theme</a></b></td>
    <td><a href="/wiki/Jason_Paige" title="Jason Paige">Jason Paige</a></td>
    <td>3:18</td>
  </tr>
  <tr>
    <td>3</td>
    <td><b><a href="/wiki/Viridian_City_(song)" title="Viridian City (song)">Viridian City</a></b></td>
    <td><a href="/wiki/Jason_Paige" title="Jason Paige">Jason Paige</a></td>
    <td>3:29</td>
  </tr>
</table>
<h2><span id="Chart_performance">Chart performance</span></h2>
<p><a href="/wiki/Pok%C3%A9mon_in_Australia" title="Pokémon in Australia">Australia</a></p>
`;

const SINGLE_PAGE = `
<h2><span id="Track_listing">Track listing</span></h2>
<p>These songs also appear on the <a href="/wiki/Pok%C3%A9mon_the_First_Movie_(soundtrack)" title="Pokémon the First Movie (soundtrack)">soundtrack</a>.</p>
<ol>
  <li><a href="/wiki/Don%27t_Say_You_Love_Me" title="Don't Say You Love Me">Don't Say You Love Me</a></li>
  <li><a href="/wiki/If_Only_Tears_Could_Bring_You_Back" title="If Only Tears Could Bring You Back">If Only Tears Could Bring You Back</a></li>
</ol>
<p><a href="https://en.wikipedia.org/wiki/M2M_(band)" title="wp:M2M (band)">M2M</a></p>
<h2><span id="Trivia">Trivia</span></h2>
<p><a href="/wiki/Pok%C3%A9mon_Theme" title="Pokémon Theme">not on this single</a></p>
`;

describe("Pokémon music parser", () => {
  it("reads album links from navigation cells and skips the heading", () => {
    const links = linksFromNavigation(ENGLISH_CDS, "albums");
    assert.deepEqual(
      links.albums.map((link) => link.page),
      ["Don't_Say_You_Love_Me_(single)", "Pokémon_X_(CD)", "Pokémon_2.B.A._Master"],
    );
    assert.equal(links.albums[0]?.title, "Don't Say You Love Me (single)");
    assert.equal(musicLinkKind(links.albums[0]?.title ?? ""), "album");
    assert.deepEqual(links.songs, []);
    assert.equal(
      navigationContentLinks(ENGLISH_CDS).some((link) => link.page === "List_of_Pokémon_music_CDs"),
      false,
    );
  });

  it("reads songs from theme templates and leaves series names in the header", () => {
    const links = linksFromNavigation(OPENING_THEMES, "songs");
    assert.deepEqual(
      links.songs.map((link) => [link.page, link.title]),
      [
        ["Pokémon_Theme", "Pokémon Theme"],
        ["Pokémon_World_(song)", "Pokémon World (song)"],
      ],
    );
    assert.equal(links.songs.some((link) => link.page === "Original_series"), false);
    assert.equal(musicLinkKind("Pokémon World (song)"), "song");
  });

  it("keeps only typed song and album links from the themes hub", () => {
    const html = `<table><tr><td>
      <a href="/wiki/List_of_English_opening_themes" title="List of English opening themes">English</a>
      <a href="/wiki/Viridian_City_(song)" title="Viridian City (song)">Viridian City</a>
      <a href="/wiki/Pok%C3%A9mon_X_(CD)" title="Pokémon X (CD)">Pokémon X</a>
    </td></tr></table>`;
    const links = linksFromNavigation(html, "hub");
    assert.deepEqual(links.songs.map((link) => link.page), ["Viridian_City_(song)"]);
    assert.deepEqual(links.albums.map((link) => link.page), ["Pokémon_X_(CD)"]);
  });

  it("takes the title column from an album tracklist", () => {
    const songs = tracklistSongs(ALBUM_PAGE);
    assert.deepEqual(songs.map((song) => song.page), ["Pokémon_Theme", "Viridian_City_(song)"]);
    assert.equal(songs.some((song) => song.page === "Jason_Paige"), false);
    assert.equal(songs.some((song) => song.page === "Pokémon_in_Australia"), false);
  });

  it("prefers the translation column over the artist on Japanese tracklists", () => {
    const html = `
      <h2><span id="Tracklist">Tracklist</span></h2>
      <table>
        <tr><th>No.</th><th>Track Title</th><th>Translation</th><th>Artist</th><th>Duration</th></tr>
        <tr>
          <td>1</td>
          <td><span title="Mezase Pokemon Masutā">めざせポケモンマスター</span></td>
          <td><a href="/wiki/Aim_to_Be_a_Pok%C3%A9mon_Master" title="Aim to Be a Pokémon Master">Aim to Be a Pokémon Master</a></td>
          <td><a href="/wiki/Rica_Matsumoto" title="Rica Matsumoto">Rica Matsumoto</a></td>
          <td>4:11</td>
        </tr>
      </table>
    `;
    assert.deepEqual(tracklistSongs(html).map((song) => song.title), ["Aim to Be a Pokémon Master"]);
  });

  it("keeps the bold song in a list and skips the artist after the dash", () => {
    const html = `
      <h2><span id="Tracklist">Tracklist</span></h2>
      <ol>
        <li><b><a href="/wiki/Together_With_the_Wind" title="Together With the Wind">Together With the Wind</a></b> - <a href="/wiki/Sachiko_Kobayashi" title="Sachiko Kobayashi">Sachiko Kobayashi</a></li>
      </ol>
    `;
    assert.deepEqual(tracklistSongs(html).map((song) => song.title), ["Together With the Wind"]);
  });

  it("does not treat a name inside a longer track title as the song page", () => {
    const html = `
      <h2><span id="Tracklist">Tracklist</span></h2>
      <table>
        <tr><th>No.</th><th>Translation</th><th>Duration</th></tr>
        <tr>
          <td>14</td>
          <td><a href="/wiki/Ash_Ketchum" title="Ash Ketchum">Satoshi</a>, <a href="/wiki/Sam" title="Sam">Yukinari</a>'s Friendship Theme</td>
          <td>1:37</td>
        </tr>
        <tr>
          <td>2</td>
          <td><a href="/wiki/Friends%27_Anniversary" title="Friends' Anniversary">Friends' Anniversary</a></td>
          <td>4:36</td>
        </tr>
      </table>
      <ol>
        <li><b><a href="/wiki/Ash_Ketchum" title="Ash Ketchum">Ash</a> VS <a href="/wiki/Marcus" title="Marcus">Marcus</a></b></li>
      </ol>
    `;
    assert.deepEqual(tracklistSongs(html).map((song) => song.title), ["Friends' Anniversary"]);
  });

  it("skips a Pokémon article linked inside a track title and ignores the composer", () => {
    const html = `
      <h2><span id="Tracklist">Tracklist</span></h2>
      <table>
        <tr><th>No.</th><th>Translation</th><th>Composer</th></tr>
        <tr>
          <td>6</td>
          <td><a href="/wiki/Unown_(Pok%C3%A9mon)" title="Unown (Pokémon)">Unown</a>'s Theme</td>
          <td><a href="/wiki/Junichi_Masuda" title="Junichi Masuda">Junichi Masuda</a></td>
        </tr>
        <tr>
          <td>2</td>
          <td><a href="/wiki/Pichu_Pika%E2%99%AASwing" title="Pichu Pika♪Swing">Pichu Pika♪Swing</a></td>
          <td><a href="/wiki/Junichi_Masuda" title="Junichi Masuda">Junichi Masuda</a></td>
        </tr>
      </table>
    `;
    assert.deepEqual(tracklistSongs(html).map((song) => song.title), ["Pichu Pika♪Swing"]);
  });

  it("reads a prose track listing and skips related albums", () => {
    const songs = tracklistSongs(SINGLE_PAGE);
    assert.deepEqual(songs.map((song) => song.title), [
      "Don't Say You Love Me",
      "If Only Tears Could Bring You Back",
    ]);
  });

  it("reads a YouTube id from an iframe, a watch URL, or youtu.be", () => {
    assert.equal(
      youtubeVideoId(`<iframe width="425" src="https://www.youtube.com/embed/R4GIyJxvk94?start=" allowfullscreen=""></iframe>`),
      "R4GIyJxvk94",
    );
    assert.equal(
      youtubeVideoId(`<a href="https://www.youtube.com/Pokémon">channel</a><a href="https://www.youtube.com/watch?v=PIetiD0G6vQ">watch</a>`),
      "PIetiD0G6vQ",
    );
    assert.equal(youtubeVideoId(`<a href="https://youtu.be/YnPs8BwkyMY">short</a>`), "YnPs8BwkyMY");
    assert.equal(
      youtubeVideoId(`<iframe src="//www.youtube-nocookie.com/embed/ClS4An0C9Bs"></iframe>`),
      "ClS4An0C9Bs",
    );
    assert.equal(youtubeVideoId(`<a href="https://www.youtube.com/Pokémon">channel only</a>`), null);
    assert.equal(youtubeVideoId("<p>No video</p>"), null);
  });

  it("prefers the embedded iframe over a later watch link", () => {
    const html = `<iframe src="https://www.youtube.com/embed/R4GIyJxvk94"></iframe><a href="https://www.youtube.com/watch?v=PIetiD0G6vQ">other</a>`;
    assert.equal(youtubeVideoId(html), "R4GIyJxvk94");
  });

  it("reads the same links from parse API JSON", () => {
    const payload = { parse: { text: OPENING_THEMES } };
    const links = linksFromNavigation(musicHtml(payload), "songs");
    assert.equal(links.songs[0]?.page, "Pokémon_Theme");
    assert.equal(youtubeVideoId(musicHtml({ parse: { text: `<iframe src="https://www.youtube.com/embed/LCNHc12volU?start="></iframe>` } })), "LCNHc12volU");
  });

  it("rejects a music index that is not a list of albums and songs", () => {
    const broken = readMusicIndex({ albums: [{ title: "Nope" }] });
    assert.equal(broken.error, "The music list could not be read.");
    assert.deepEqual(broken.index.albums, []);
    const ready = readMusicIndex({
      revision: 1,
      fetchedAt: "2026-10-20T00:00:00.000Z",
      albums: [{ title: "Pokémon X", page: "Pokémon_X_(CD)", url: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_X_(CD)", group: "English CDs", songs: ["Pokémon_Theme"] }],
      songs: [{ title: "Pokémon Theme", page: "Pokémon_Theme", url: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Theme", youtubeId: "R4GIyJxvk94" }],
      gaps: [{ page: "Missing_(song)", code: "missingtitle" }],
    });
    assert.equal(ready.error, "");
    assert.equal(ready.index.songs[0]?.youtubeId, "R4GIyJxvk94");
  });
});
