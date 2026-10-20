import { syncLocalPlaylist, type SyncTrack } from "@/lib/webaoo-api";
import {
  LOCAL_FILE_ONLY,
  localAudioError,
  WEBAOO_TRACK_CAP,
  YOUTUBE_STAYS_EMBED,
  youtubeStayEmbedMessage,
} from "@/lib/webaoo";
import {
  asSendFailure,
  looksLikeGateway,
  PUBLIC_LINK_TIMEOUT,
  reconnectMessage,
} from "@/lib/yoto-error";
import { bearerToken, jsonError } from "@/lib/yoto-proxy";

/**
 * Accepts MP3 and M4A bytes the browser already has.
 * A video id or a YouTube URL is rejected here and is never fetched.
 */

type ListedTrack = {
  id?: string;
  title?: string;
  icon?: string;
  fileName?: string;
};

function blockedText(value: string): string | null {
  return youtubeStayEmbedMessage(value);
}

function blockedPayload(value: unknown): string | null {
  if (typeof value === "string") return blockedText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = blockedPayload(item);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    if (/url|video|youtube|link|source/i.test(key)) {
      if (typeof item === "string" && item.trim()) {
        return blockedText(item) ?? LOCAL_FILE_ONLY;
      }
    }
    const hit = blockedPayload(item);
    if (hit) return hit;
  }
  return null;
}

function splitUploadName(name: string): { id: string; fileName: string } {
  const index = name.indexOf("__");
  if (index <= 0) return { id: "", fileName: name };
  return { id: name.slice(0, index), fileName: name.slice(index + 2) };
}

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("videoId") || params.has("v") || params.has("youtube")) {
    return jsonError(YOUTUBE_STAYS_EMBED);
  }
  const remote = params.get("url");
  if (remote) return jsonError(blockedText(remote) ?? LOCAL_FILE_ONLY);

  const token = bearerToken(request);
  if (!token) return jsonError("Reconnect Yoto. This login expired.", 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      payload = null;
    }
    const blocked = blockedPayload(payload);
    if (blocked) return jsonError(blocked);
    return jsonError(LOCAL_FILE_ONLY);
  }
  if (!contentType.includes("multipart/form-data")) return jsonError(LOCAL_FILE_ONLY);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("The files could not be read.");
  }

  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (/url|video|youtube|link|source/i.test(key) && value.trim()) {
      return jsonError(blockedText(value) ?? LOCAL_FILE_ONLY);
    }
    const hit = blockedText(value);
    if (hit) return jsonError(hit);
  }

  let listed: ListedTrack[] = [];
  const rawTracks = form.get("tracks");
  if (typeof rawTracks === "string" && rawTracks.trim()) {
    try {
      const parsed = JSON.parse(rawTracks) as unknown;
      if (!Array.isArray(parsed)) return jsonError("The track list was not valid.");
      listed = parsed.filter((item): item is ListedTrack => Boolean(item) && typeof item === "object");
    } catch {
      return jsonError("The track list was not valid.");
    }
  }

  const files = form.getAll("audio").filter((item): item is File => item instanceof File);
  if (files.length === 0) return jsonError(LOCAL_FILE_ONLY);
  if (files.length > WEBAOO_TRACK_CAP) {
    return jsonError(`A playlist holds ${WEBAOO_TRACK_CAP} tracks. Remove one before adding another.`);
  }

  const byId = new Map<string, File>();
  const loose: File[] = [];
  for (const file of files) {
    const named = splitUploadName(file.name);
    if (named.id) byId.set(named.id, file);
    else loose.push(file);
  }

  const ordered: Array<{ meta: ListedTrack; file: File; fileName: string }> = [];
  if (listed.length > 0) {
    for (const meta of listed) {
      const id = meta.id ?? "";
      const file = (id && byId.get(id)) || loose.shift();
      if (!file) return jsonError(`${meta.title || meta.fileName || "A track"} is missing its audio file.`);
      ordered.push({ meta, file, fileName: meta.fileName || splitUploadName(file.name).fileName || file.name });
    }
  } else {
    for (const file of files) {
      const named = splitUploadName(file.name);
      ordered.push({ meta: { id: named.id, fileName: named.fileName }, file, fileName: named.fileName || file.name });
    }
  }

  const tracks: SyncTrack[] = [];
  for (const [index, item] of ordered.entries()) {
    const fileName = item.fileName;
    const problem = localAudioError(fileName, item.file.type);
    if (problem) return jsonError(problem);
    const bytes = Buffer.from(await item.file.arrayBuffer());
    if (bytes.length > 40 * 1024 * 1024) return jsonError("That file is too large. Add a shorter MP3 or M4A.");
    tracks.push({
      id: item.meta.id || `t${index + 1}`,
      title: item.meta.title?.trim() || "",
      icon: item.meta.icon,
      fileName,
      mime: item.file.type,
      bytes,
    });
  }

  try {
    const result = await syncLocalPlaylist({
      token,
      title: String(form.get("title") ?? ""),
      cardId: String(form.get("cardId") ?? ""),
      tracks,
    });
    return Response.json(result);
  } catch (error) {
    const failure = asSendFailure(error, "Yoto did not accept this playlist.");
    const reconnect = reconnectMessage(failure.message);
    if (reconnect) return jsonError(reconnect, 401);
    if (/reconnect yoto/i.test(failure.message)) return jsonError(failure.message, 401);
    const text = looksLikeGateway(0, failure.message) ? PUBLIC_LINK_TIMEOUT : failure.message;
    return jsonError(text, 422);
  }
}
