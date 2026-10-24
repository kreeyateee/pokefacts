export function artworkSrc(kind: "species" | "form" | "shiny" | "dream" | "battle", id: number): string {
  return `/api/artwork/${kind}/${id}`;
}
