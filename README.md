# Champdex

Pokémon facts and Guess Who for ages 8 to 12. Each fact is a short Pokédex entry from PokéAPI, in full sentences: the name, the type, the description, how much it weighs, how tall it is in centimetres, and a few more facts. Play them in the browser, or send the same words to a [Yoto](https://yotoplay.com) card.

- **Facts** — pick Bulbasaur, Pikachu, and the rest. Each one says the name, the type, the Pokédex entry, the weight, the height, and a few more facts.
- **Guess Who** — three clues, then you say the name. The answer plays after you guess.

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
