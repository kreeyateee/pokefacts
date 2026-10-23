import { adventureRoute } from "@/lib/story/adventure-route";
import { islandAdventure } from "@/lib/story/island";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(islandAdventure, "The Island Adventure could not be opened.");
