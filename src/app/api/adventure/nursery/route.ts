import { adventureRoute } from "@/lib/story/adventure-route";
import { nurseryAdventure } from "@/lib/story/nursery";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(nurseryAdventure, "The Pokémon Nursery could not be opened.");
