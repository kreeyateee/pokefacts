import { Studio } from "@/components/studio";
import {
  listAlolanForms,
  listGigantamaxForms,
  listHisuianForms,
  listLegendarySheets,
  listMegaForms,
  listMonSheets,
  listMythicalSheets,
  listStarterSheets,
} from "@/lib/catalogue-db";
import { formPlaylist, formPlaylists, jokePlaylist, speciesPlaylists } from "@/lib/kid-cards";
import { loadKidCards } from "@/lib/load-kid-cards";

export default async function Home() {
  const cards = await loadKidCards();
  const mega = formPlaylist("mega", listMegaForms());
  const gmax = formPlaylist("gmax", listGigantamaxForms());
  const alola = formPlaylists("alola", listAlolanForms());
  const hisui = formPlaylists("hisui", listHisuianForms());
  const legendary = speciesPlaylists("legendary", listLegendarySheets());
  const mythical = speciesPlaylists("mythical", listMythicalSheets());
  const starter = speciesPlaylists("starter", listStarterSheets());
  const joke = [jokePlaylist(listMonSheets())];
  return (
    <Studio
      cards={cards}
      mega={mega}
      gmax={gmax}
      alola={alola}
      hisui={hisui}
      legendary={legendary}
      mythical={mythical}
      starter={starter}
      joke={joke}
    />
  );
}
