import { searchCatalogue } from "@/lib/catalogue-db";

export function GET(request: Request) {
  const url = new URL(request.url);
  const generation = Number(url.searchParams.get("generation") ?? "");
  const page = Number(url.searchParams.get("page") ?? "1");
  try {
    return Response.json(
      searchCatalogue({
        q: url.searchParams.get("q") ?? "",
        type: url.searchParams.get("type") ?? "",
        generation: Number.isInteger(generation) ? generation : 0,
        page: Number.isInteger(page) ? page : 1,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The catalogue could not be opened.";
    return Response.json({ error: message }, { status: 500 });
  }
}
