import { adventureRoute } from "@/lib/story/adventure-route";
import { gymAdventure } from "@/lib/story/gym";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(gymAdventure, "The Gym Challenge could not be set up.");
