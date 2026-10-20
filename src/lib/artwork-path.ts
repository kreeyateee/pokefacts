export function artworkSrc(kind: "species" | "form", id: number): string {
  return `/api/artwork/${kind}/${id}`;
}
