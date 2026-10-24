import { adventureRoute } from "@/lib/story/adventure-route";
import { lostAdventure } from "@/lib/story/lost";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(lostAdventure, "Find Your Trainer could not be set up.");
