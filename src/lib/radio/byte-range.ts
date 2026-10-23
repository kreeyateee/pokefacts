/**
 * One byte range from a Range header ("bytes=0-1023", "bytes=500-", "bytes=-500"), clamped to the file.
 * Null means send the whole file; "invalid" means the range is outside it. Several ranges are answered
 * with the whole file, which every client accepts.
 */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  let start: number;
  let end: number;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}
