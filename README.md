# Champdex

Pokémon facts and Guess Who for ages 8 to 12, plus a reference catalogue of all 1,025 national species (1,351 forms). Each catalogue entry uses [PokéAPI](https://pokeapi.co/) game data: an English Pokédex line, the types, the height in centimetres, the weight in kilograms, the abilities (including hidden ones), the base stats, and the evolution. Nine species also keep a short Champdex note. Bulbapedia articles are not copied into it.

The catalogue pictures are local files in `public/sprites`. A PDF of Pokémon images was not in the workspace, so these are the PokéAPI front sprites (`sprites/pokemon/{id}.png`). The nine Yoto card icons stay 16×16 pixels in `public/pixels`.

Each spoken fact starts with the PokéAPI cry, then the name, then a short description in our own words, plus the type, the weight, and the height. The pictures on the Yoto cards are 16×16 pixels. Play them in the browser, or send the card to [Yoto](https://yotoplay.com).

- **Catalogue** — search every species from Bulbasaur to Pecharunt.
- **Facts** — pick Bulbasaur, Pikachu, and the rest. You hear the cry, the name, then the Pokédex entries.
- **Guess Who** — three clues, then you say the name. The answer plays after you guess.

The catalogue lives in SQLite at `data/champdex.sqlite` (no PostgreSQL). Rebuild it from the PokéAPI tables with `npm run catalogue` after those CSV files are in `/tmp/poke-csv`, including `pokemon_species_flavor_text.csv`, `versions.csv`, `version_names.csv`, `pokemon_moves.csv`, `ability_flavor_text.csv`, and `move_flavor_text.csv`. The `pokedex` view has the species id, name, height, weight, the six base stats, types, evolution set, and the PokéAPI `info` line. Abilities and moves are their own tables.

On a Yoto player those are two Make Your Own cards. The child turns to a picture and presses play.

## Play it on a Yoto

1. Run this app and open it.
2. In the [Yoto developer dashboard](https://dashboard.yoto.dev/), create a **public** client. Copy the client ID. Do not paste the client secret into Champdex.
3. Add this callback URL to that client: `http://localhost:3847/callback`
4. In Champdex, choose **Connect Yoto**. The login asks to create Make Your Own content, stay signed in, and read your name.
5. Open **Put these facts on a Yoto card** and send **Facts**. Do the same for **Guess Who** if you want that game on its own card.
6. In the Yoto app, open **Make Your Own**, find **Champdex: Pokémon Facts**, and choose **Link to a card**.
7. Put a blank Make Your Own card in the player when it asks.
8. Hand that card to your child. Repeat with a second blank card for Guess Who.

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
