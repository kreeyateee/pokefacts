import { adventureRoute } from "@/lib/story/adventure-route";
import { safariAdventure } from "@/lib/story/safari";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(safariAdventure, "The Safari Zone could not be opened.");
