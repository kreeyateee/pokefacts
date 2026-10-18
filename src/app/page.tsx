import { Studio } from "@/components/studio";
import { loadKidCards } from "@/lib/load-kid-cards";

export default async function Home() {
  const cards = await loadKidCards();
  return <Studio cards={cards} />;
}
