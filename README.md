# Champdex

Pokémon facts and Guess Who for ages 8 to 12, plus a reference catalogue of all 1,025 national species (1,351 forms). Each catalogue entry uses [PokéAPI](https://pokeapi.co/) game data: an English Pokédex line, the types, the height in centimetres, the weight in kilograms, the abilities (including hidden ones), the base stats, and the evolution. Nine species also keep a short Champdex note. Bulbapedia articles are not copied into it.

The catalogue pictures are local files in `public/sprites`. A PDF of Pokémon images was not in the workspace, so these are the PokéAPI front sprites (`sprites/pokemon/{id}.png`). The Yoto pictures are 16×16 RGBA icons in `public/pixels`, made from those sprites with `ffmpeg -vf scale=16:16:flags=neighbor,format=rgba`.

A spoken fact is the name, then the English Pokédex line, then the weight and the height in full sentences, plus a short evolution, ability, or home line when the catalogue has one. Stats stay on the catalogue page. Play a fact in the browser, or send one playlist to [Yoto](https://yotoplay.com). Nine species still have a cry clip for the Hear button. Everyone else uses the browser voice.

The Facts playlist you send is **100 Pokémon drawn at random**. Shuffle draws a new hundred. Send uses the hundred on the page. Each track is that Pokémon’s 16×16 picture plus an MP3 in Lily’s voice. Yoto Labs records the MP3 from the script. Champdex does not upload a separate recording. The how-to sits in the playlist description and at the start of the first track, so the card stays at 100 tracks.

- **Catalogue** — search every species from Bulbasaur to Pecharunt.
- **Facts** — the random 100 on the page. Numbered ranges such as Facts 1–99 are still there if you want a fixed stretch.
- **Guess Who** — three clues, then you say the name. The answer plays after you guess, and the picture changes.

The catalogue lives in SQLite at `data/champdex.sqlite` (no PostgreSQL). Rebuild it from the PokéAPI tables with `npm run catalogue` after those CSV files are in `/tmp/poke-csv`, including `pokemon_species_flavor_text.csv`, `versions.csv`, `version_names.csv`, `pokemon_moves.csv`, `ability_flavor_text.csv`, and `move_flavor_text.csv`. The `pokedex` view has the species id, name, height, weight, the six base stats, types, evolution set, and the PokéAPI `info` line. Abilities and moves are their own tables. Facts and Guess Who are built from that file. The page does not call PokéAPI once per species.

## How the full set is split

A Yoto Make Your Own playlist holds **100 tracks**. Champdex does not put 1,025 Pokémon on one card.

| Playlist | Tracks on a card | Pokémon on a card | Cards |
| --- | --- | --- | --- |
| Facts | 1 start track + 1 track each | 99 | **11** (the last card is Facts 991–1025) |
| Guess Who | 1 start track + 2 tracks each (clues, then the answer) | 49 | **21** (the last card is Guess Who 981–1025) |

The default Facts send is one card: the random 100. The numbered Facts ranges and the 21 Guess Who cards are still there if you want them. Guess Who keeps a detective icon during the clues. The answer track switches to that Pokémon's 16×16 picture.

## Send one playlist from home

1. Run this app and open it.
2. In the [Yoto developer dashboard](https://dashboard.yoto.dev/), create a **public** client. Copy the client ID. Do not paste the client secret into Champdex.
3. Add this callback URL to that client: `http://localhost:3847/callback`
4. In Champdex, choose **Connect Yoto**. The login asks to create Make Your Own content, stay signed in, and read your name. Leave the voice on Lily.
5. Open **Facts**. You see 100 Pokémon. **Shuffle** draws a different hundred. The send uses the list on screen.
6. Open **Put Random 100 on a Yoto card** and send it. Champdex uploads those 100 pictures. Yoto records Lily (`pFZP5JQG7iQjIQuC4Bku`) as an MP3 for each track.
7. In the Yoto app, open **Make Your Own**, find **Champdex: Random 100**, and choose **Link to a card**.
8. Put one blank Make Your Own card in the player when it asks.
9. Guess Who is still split into 21 playlists. Send one range at a time if you want that game, each on its own blank card.

## Run it here

```bash
npm ci
npm run dev
```

The app is at [http://localhost:3847](http://localhost:3847).

```bash
npm test
npm run lint
```

`NEXT_PUBLIC_YOTO_CLIENT_ID` in `.env.example` is optional. You can paste the client ID in the connect dialog instead. Champdex uses the browser login from [yoto.dev](https://yoto.dev) and never stores a client secret.

## What this is not

Unofficial fan cards for your own Yoto library. Not made by Nintendo, Game Freak, Creatures, or Yoto.
