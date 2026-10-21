import { connection } from "next/server";

import { Studio } from "@/components/studio";
import {
  listAlolanForms,
  listGigantamaxForms,
  listHisuianForms,
  listLegendarySheets,
  listMegaForms,
  listMythicalSheets,
} from "@/lib/catalogue-db";
import { formPlaylist, formPlaylists, speciesPlaylists } from "@/lib/kid-cards";
import { loadKidCards } from "@/lib/load-kid-cards";

export default async function Home() {
  await connection();
  const cards = await loadKidCards();
  const mega = formPlaylist("mega", listMegaForms());
  const gmax = formPlaylist("gmax", listGigantamaxForms());
  const alola = formPlaylists("alola", listAlolanForms());
  const hisui = formPlaylists("hisui", listHisuianForms());
  const legendary = speciesPlaylists("legendary", listLegendarySheets());
  const mythical = speciesPlaylists("mythical", listMythicalSheets());
  return (
    <Studio
      cards={cards}
      mega={mega}
      gmax={gmax}
      alola={alola}
      hisui={hisui}
      legendary={legendary}
      mythical={mythical}
    />
  );
}
