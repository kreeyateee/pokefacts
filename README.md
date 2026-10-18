# Champdex

Spoken Pokémon cards for a [Yoto](https://yotoplay.com) player. A seven-year-old puts in a Make Your Own card, turns to a picture, and presses play. They never need this website.

There are three cards:

- **Meet Them** — eight Pokémon, one picture each. Start here. One blank card is enough.
- **Guess Who** — three clues, a count to three, then the answer. The pixel picture changes when the answer starts.
- **Grow Up** — plant, fire, and water families, in order. The story tells them when to turn to the next number.

The words are short on purpose. Each picture is one little chapter on the player.

## Play it on a Yoto

1. Run this app and open it.
2. In the [Yoto developer dashboard](https://dashboard.yoto.dev/), create a **public** client. Copy the client ID. Do not paste the client secret into Champdex.
3. Add this callback URL to that client: `http://localhost:3847/callback`
4. In Champdex, choose **Connect Yoto**. The login asks to create Make Your Own content, stay signed in, and read your name.
5. Send **Meet Them**. Yoto records the speech into your library.
6. In the Yoto app, open **Make Your Own**, find **Champdex: Meet Them**, and choose **Link to a card**.
7. Put a blank Make Your Own card in the player when the app asks.
8. Hand that card to your child.

On the player they turn the wheel, or press the arrow buttons, until a picture shows up, then press the big button. The star picture explains it again, out loud.

Guess Who and Grow Up are extra cards. Link each one to its own blank card.

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
