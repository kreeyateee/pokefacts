# Champdex

Champdex runs on your computer and sends Pokémon cards to your own Yoto library. It covers all 1,025 national species. You can browse the catalogue, send the Pokefacts playlists, and send a Guess Who game. The pictures, the catalogue, and the app stay on this machine. A public tunnel is optional. Uploads go from this computer to Yoto.

The catalogue is game data from [PokéAPI](https://pokeapi.co/): an English Pokédex line, the types, the height, the weight, the abilities, the base stats, and the evolution. Nine species also have a short Champdex note. Bulbapedia articles are not copied into it.

## Install

You need two programs:

- **Node.js 22.14 or newer.** This project is built with Node.js 22.14. The catalogue is a SQLite file, and that reader is included in Node. Install the 22 line from [nodejs.org](https://nodejs.org/), then open a new terminal.
- **ffmpeg on your PATH.** Each track is a cry, then Lily’s voice. Champdex joins those two files with ffmpeg.

ffmpeg:

```bash
# macOS
brew install ffmpeg

# Ubuntu or Debian
sudo apt-get update && sudo apt-get install -y ffmpeg

# Windows, then open a new terminal
winget install Gyan.FFmpeg
```

Then, in this folder:

```bash
npm install
```

`npm install` and `npm start` are the same on Windows, macOS, and Linux.

## Start

```bash
npm start
```

`npm run local` does the same thing. The command checks the catalogue and the pictures, builds the app, then serves it. Leave the terminal open.

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

That address is this computer. A public tunnel is optional.

## Catalogue, sprites, and pixels

A normal copy of this repository already contains:

- `data/champdex.sqlite` — all 1,025 species
- `public/sprites` — one picture per species
- `public/pixels` — the 16×16 icon and the dark shadow for each species

`npm start` checks those files before it serves the app. If the database file is missing and the PokéAPI CSV tables are in `/tmp/poke-csv`, the start command builds the database with the catalogue script. You can also run `npm run catalogue` yourself. Those tables include `pokemon_species_flavor_text.csv`. Champdex does not copy Bulbapedia prose. If the pictures are missing, restore `public/sprites` and `public/pixels` from git.

## Connect Yoto

Champdex uses Yoto’s public login (PKCE). Do not paste a client secret into the app or into `.env`.

1. In the [Yoto developer dashboard](https://dashboard.yoto.dev/), create a **public** client and copy the client ID.
2. Allow this redirect URI exactly: `http://127.0.0.1:3847/callback`
3. In Champdex, choose **Connect Yoto**, paste the client ID, and continue. Open the app at `http://127.0.0.1:3847` first. `localhost` is sent to that same address so the login can finish.
4. Approve the login. It asks for `user:content:manage`, `user:content:view`, `family:library:view`, `offline_access`, and `profile`.

`NEXT_PUBLIC_YOTO_CLIENT_ID` in `.env.example` is optional. You can paste the client ID in the connect dialog instead.

## Send Pokefacts

Open **Facts** and choose **Send all 11 Pokefacts playlists**.

Champdex records one short request per track. The audio is the latest cry, then Lily (`pFZP5JQG7iQjIQuC4Bku`). Yoto titles the playlists exactly Pokefacts 1 through Pokefacts 11. On the page they are labeled like Pokefacts 1 (1-99). Each playlist is created new, with no saved card id on the full send. Each card stays at 100 tracks or fewer: a short intro plus up to 99 Pokémon. Pokefacts 11 is the last card (numbers 991–1025). Together they cover all 1,025 species.

Leave this terminal open until the page says the playlists are ready. In the Yoto app, open **Make Your Own**, find each playlist, and choose **Link to a card**. Put a blank Make Your Own card in the player when it asks.

A smaller Facts option is still there: **100 Pokémon drawn at random**, titled Pokefacts random. Shuffle draws a new hundred. Send uses the hundred on the page.

## Send Guess Who

Open **Guess Who**. You get 50 riddles drawn at random, which is 100 tracks on one card. Shuffle draws a new fifty. Send uses the fifty on the page.

Each riddle is two tracks. The clue plays the cry, then the riddle, and does not say the name. Its picture is the shadow pixel. The answer plays the cry, then “It is {Name}.” Its picture is the real pixel. On the page, the shadow stays up until the answer is revealed.

## Stop

Press Ctrl+C in the terminal. Start again later with `npm start`.

## What this is not

Unofficial fan cards for your own Yoto library. Not made by Nintendo, Game Freak, Creatures, or Yoto.
