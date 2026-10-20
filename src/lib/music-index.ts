export type MusicSong = {
  title: string;
  page: string;
  url: string;
  youtubeId: string | null;
};

export type MusicAlbum = {
  title: string;
  page: string;
  url: string;
  group: string;
  songs: string[];
};

export type MusicGap = {
  page: string;
  code: string;
};

export type MusicIndex = {
  revision: number;
  fetchedAt: string;
  albums: MusicAlbum[];
  songs: MusicSong[];
  gaps: MusicGap[];
};

export function emptyMusicIndex(): MusicIndex {
  return { revision: 1, fetchedAt: "", albums: [], songs: [], gaps: [] };
}

function isAlbum(value: unknown): value is MusicAlbum {
  if (!value || typeof value !== "object") return false;
  const row = value as MusicAlbum;
  return (
    typeof row.title === "string" &&
    typeof row.page === "string" &&
    typeof row.url === "string" &&
    typeof row.group === "string" &&
    Array.isArray(row.songs) &&
    row.songs.every((song) => typeof song === "string")
  );
}

function isSong(value: unknown): value is MusicSong {
  if (!value || typeof value !== "object") return false;
  const row = value as MusicSong;
  return (
    typeof row.title === "string" &&
    typeof row.page === "string" &&
    typeof row.url === "string" &&
    (row.youtubeId === null || typeof row.youtubeId === "string")
  );
}

function isGap(value: unknown): value is MusicGap {
  if (!value || typeof value !== "object") return false;
  const row = value as MusicGap;
  return typeof row.page === "string" && typeof row.code === "string";
}

/** A bad index becomes an empty list plus a sentence the tab can show. */
export function readMusicIndex(value: unknown): { index: MusicIndex; error: string } {
  const empty = emptyMusicIndex();
  if (!value || typeof value !== "object") {
    return { index: empty, error: "The music list could not be read." };
  }
  const row = value as Partial<MusicIndex>;
  if (!Array.isArray(row.albums) || !Array.isArray(row.songs)) {
    return { index: empty, error: "The music list could not be read." };
  }
  const albums = row.albums.filter(isAlbum);
  const songs = row.songs.filter(isSong);
  if (albums.length !== row.albums.length || songs.length !== row.songs.length) {
    return { index: empty, error: "The music list could not be read." };
  }
  const gaps = Array.isArray(row.gaps) ? row.gaps.filter(isGap) : [];
  return {
    index: {
      revision: typeof row.revision === "number" ? row.revision : 1,
      fetchedAt: typeof row.fetchedAt === "string" ? row.fetchedAt : "",
      albums,
      songs,
      gaps,
    },
    error: "",
  };
}
