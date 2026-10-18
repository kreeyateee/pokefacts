import { cacheLife } from "next/cache";

import { listMonSheets } from "@/lib/catalogue-db";
import { kidCardsFromDex, type KidCard } from "@/lib/kid-cards";

export async function loadKidCards(): Promise<KidCard[]> {
  "use cache";
  cacheLife("hours");
  return kidCardsFromDex(listMonSheets());
}
