import { emptyWebaooDraft, type WebaooDraft, type WebaooTrack } from "@/lib/webaoo";

/**
 * Local file state for staged music.
 * Audio bytes live in IndexedDB so a refresh keeps them.
 * localStorage keeps names, order, and titles only. It does not keep the bytes.
 */

const DB_NAME = "pokefacts.webaoo";
const DB_VERSION = 1;
const DRAFT_KEY = "current";
export const WEBAOO_META_KEY = "pokefacts.webaoo.meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("draft")) db.createObjectStore("draft");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("The browser could not store these files."));
  });
}

function requestOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser could not store these files."));
  });
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The browser could not store these files."));
    tx.onabort = () => reject(tx.error ?? new Error("The browser could not store these files."));
  });
}

export function writeWebaooMeta(draft: WebaooDraft): void {
  const meta = {
    title: draft.title,
    cardId: draft.cardId,
    tracks: draft.tracks.map(({ id, fileName, title, icon, mime, order }) => ({
      id,
      fileName,
      title,
      icon,
      mime,
      order,
    })),
  };
  localStorage.setItem(WEBAOO_META_KEY, JSON.stringify(meta));
}

export function readWebaooMeta(): WebaooDraft | null {
  try {
    const raw = localStorage.getItem(WEBAOO_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebaooDraft;
    if (!parsed || !Array.isArray(parsed.tracks)) return null;
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : "My music",
      cardId: typeof parsed.cardId === "string" ? parsed.cardId : "",
      tracks: parsed.tracks.filter((track): track is WebaooTrack => {
        return Boolean(track && typeof track.id === "string" && typeof track.fileName === "string");
      }),
    };
  } catch {
    return null;
  }
}

export async function saveWebaooDraft(draft: WebaooDraft): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("draft", "readwrite");
    tx.objectStore("draft").put(draft, DRAFT_KEY);
    await finish(tx);
  } finally {
    db.close();
  }
  writeWebaooMeta(draft);
}

export async function putWebaooBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, id);
    await finish(tx);
  } finally {
    db.close();
  }
}

export async function readWebaooBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction("blobs", "readonly");
    const stored = await requestOf(tx.objectStore("blobs").get(id));
    await finish(tx);
    return stored instanceof Blob ? stored : null;
  } finally {
    db.close();
  }
}

export async function deleteWebaooBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").delete(id);
    await finish(tx);
  } finally {
    db.close();
  }
}

export async function loadWebaooDraft(): Promise<{ draft: WebaooDraft; clips: Record<string, string> }> {
  const db = await openDb();
  try {
    const tx = db.transaction(["draft", "blobs"], "readonly");
    const stored = await requestOf(tx.objectStore("draft").get(DRAFT_KEY));
    const draft = normalizeDraft(stored);
    const clips: Record<string, string> = {};
    for (const track of draft.tracks) {
      const blob = await requestOf(tx.objectStore("blobs").get(track.id));
      if (blob instanceof Blob) clips[track.id] = URL.createObjectURL(blob);
    }
    await finish(tx);
    return { draft, clips };
  } finally {
    db.close();
  }
}

function normalizeDraft(stored: unknown): WebaooDraft {
  if (!stored || typeof stored !== "object") return emptyWebaooDraft();
  const row = stored as WebaooDraft;
  if (!Array.isArray(row.tracks)) return emptyWebaooDraft();
  const tracks = row.tracks
    .filter((track): track is WebaooTrack => Boolean(track && typeof track.id === "string"))
    .map((track, order) => ({
      id: track.id,
      fileName: typeof track.fileName === "string" ? track.fileName : "track.mp3",
      title: typeof track.title === "string" && track.title.trim() ? track.title.slice(0, 80) : "Track",
      icon: typeof track.icon === "string" ? track.icon : "",
      mime: typeof track.mime === "string" ? track.mime : "audio/mpeg",
      order: Number.isInteger(track.order) ? track.order : order,
    }))
    .sort((a, b) => a.order - b.order)
    .map((track, order) => ({ ...track, order }));
  return {
    title: typeof row.title === "string" && row.title.trim() ? row.title.slice(0, 80) : "My music",
    cardId: typeof row.cardId === "string" ? row.cardId : "",
    tracks,
  };
}
