import { adventureRoute } from "@/lib/story/adventure-route";
import { paldeaAdventure } from "@/lib/story/paldea";

/** GET ?seed=<int>&owner=<name>&partner=<dex number> returns { story }. See adventureRoute. */
export const GET = adventureRoute(paldeaAdventure, "The Paldea Picnic could not be set up.");
