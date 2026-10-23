import { islandAdventure } from "@/lib/story/island";
import { cleanOwner } from "@/lib/story/safari";

/**
 * GET ?seed=<int>&owner=<name> returns { story }.
 * With no seed a new one is drawn, so each send makes a new adventure. The story id carries the seed.
 * An owner that is not 1 to 40 letters, spaces, hyphens or apostrophes is ignored.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const rawSeed = (url.searchParams.get("seed") ?? "").trim();
  let seed: number;
  if (rawSeed === "") {
    seed = Math.floor(Math.random() * 2 ** 31);
  } else {
    seed = Number(rawSeed);
    if (!/^-?\d{1,16}$/.test(rawSeed) || !Number.isSafeInteger(seed)) {
      return Response.json({ error: "The seed must be a whole number." }, { status: 400 });
    }
  }
  const owner = cleanOwner(url.searchParams.get("owner"));
  try {
    return Response.json({ story: islandAdventure({ seed, owner }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Island Adventure could not be opened.";
    return Response.json({ error: message }, { status: 500 });
  }
}
