import { Studio } from "@/components/studio";
import { listGigantamaxForms, listMegaForms } from "@/lib/catalogue-db";
import { formPlaylist } from "@/lib/kid-cards";
import { loadKidCards } from "@/lib/load-kid-cards";

export default async function Home() {
  const cards = await loadKidCards();
  const mega = formPlaylist("mega", listMegaForms());
  const gmax = formPlaylist("gmax", listGigantamaxForms());
  return <Studio cards={cards} mega={mega} gmax={gmax} />;
}
