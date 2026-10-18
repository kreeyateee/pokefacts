import { factsPlaylistUpload, pokefactsTitle, type KidCard } from "@/lib/kid-cards";
import { savedCardIsGone, yotoErrorText } from "@/lib/yoto-error";

export type SavedCardMap = Partial<Record<string, string>>;

export type PlaylistUpload = {
  voiceId: string;
  /** When set, the job route deletes cardId before Yoto sees the body. */
  create?: boolean;
  content: {
    title?: string;
    cardId?: string;
    metadata?: { title?: string; description?: string };
    content?: unknown;
  };
};

export function dropSavedCard(store: SavedCardMap, playlistId: string): SavedCardMap {
  if (!Object.prototype.hasOwnProperty.call(store, playlistId)) return store;
  const next = { ...store };
  delete next[playlistId];
  return next;
}

/**
 * One numbered Pokefacts playlist for the bulk send.
 * The body is always a create: no saved card id, title "Pokefacts N".
 */
export function factsBulkUpload(card: KidCard, mediaById: Record<number, string>): PlaylistUpload {
  const index = Number(/^meet-(\d+)$/.exec(card.id)?.[1]);
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("That Pokefacts playlist has no number.");
  }
  const title = pokefactsTitle(index);
  const upload = factsPlaylistUpload(card, mediaById);
  const content = { ...upload.content, title };
  delete content.cardId;
  content.metadata = { ...content.metadata, title };
  return { voiceId: upload.voiceId, create: true, content };
}

/**
 * A replace was rejected because that card is gone.
 * Drop the saved id and, once, send the same playlist as a create.
 */
export function afterRejectedPlaylist(options: {
  playlistId: string;
  upload: PlaylistUpload;
  status: number;
  body: unknown;
  store: SavedCardMap;
  retried: boolean;
}):
  | { action: "retry-create"; upload: PlaylistUpload; store: SavedCardMap }
  | { action: "fail"; store: SavedCardMap; message: string } {
  const missing = options.status === 400 || savedCardIsGone(options.status, options.body);
  const store = missing ? dropSavedCard(options.store, options.playlistId) : options.store;
  if (!options.retried && options.upload.content.cardId && missing) {
    const content = { ...options.upload.content };
    delete content.cardId;
    return {
      action: "retry-create",
      upload: { ...options.upload, create: true, content },
      store,
    };
  }
  return {
    action: "fail",
    store,
    message: yotoErrorText(options.body, "Yoto did not accept this card."),
  };
}

/** Status line for a bulk stop. Names Yoto's error and does not claim a replace. */
export function bulkFailureText(input: {
  headline: string;
  rangeLabel: string;
  reason: string;
  createdTitles: string[];
}): string {
  const prior =
    input.createdTitles.length > 0 ? ` Created in this run: ${input.createdTitles.join(", ")}.` : "";
  return `${input.headline} failed (${input.rangeLabel}). ${input.reason.trim()}${prior}`;
}
