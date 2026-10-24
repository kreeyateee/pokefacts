import { adventureRoute } from "@/lib/story/adventure-route";
import { playAdventure } from "@/lib/story/play";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(playAdventure, "Friendly Battles could not be set up.");
