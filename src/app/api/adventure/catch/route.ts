import { adventureRoute } from "@/lib/story/adventure-route";
import { catchAdventure } from "@/lib/story/catching";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(catchAdventure, "Catch Quest could not be set up.");
