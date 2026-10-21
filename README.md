# Pokefacts

Pokémon cards for a [Yoto](https://yotoplay.com/) player. Hear a fact or a riddle on this page, send the playlist to your library, then link it to a blank Make Your Own card.

**Use it here: [pokefacts.online](https://pokefacts.online/)**

<p align="center">
  <a href="https://buymeacoffee.com/kreeyate">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="72">
  </a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/kreeyate"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy me a coffee"></a>
  <a href="https://pokefacts.online/"><img src="https://img.shields.io/badge/Open-pokefacts.online-e10600?style=for-the-badge" alt="Open pokefacts.online"></a>
</p>

Pokefacts is **free**. There is no account to pay for, and there is no paywall. If you like it, [buy me a coffee](https://buymeacoffee.com/kreeyate) — that is the tip jar. The app stays free either way.

You can also run it on your own computer. That path is below. The first time takes a while: you install two free programs, leave a window open, and connect your own Yoto account. After that, starting it again is one line.

This is a fan project. It is not made by Nintendo, Game Freak, Creatures, or Yoto.

## What it can do

The menu has five destinations. **Help** and **Connect Yoto** sit in the header. The wordmark goes home.

- **Facts.** A short reading for all 1,025 Pokémon. The cry plays first, then the voice. The full set is 11 playlists, Pokefacts 1 through Pokefacts 11. There is also a random card of 100. Shuffle draws a new hundred. **This playlist** and **Make this card** sit in the same place on every card page. **Send all** records every Pokefacts playlist so the whole dex is covered.
- **Who's That.** Fifty riddles on one card. The clue picture is a black silhouette on opaque white. You hear the colour and the type, two Pokédex lines with the name taken out, then size and weight. The clue never says the name. The next track plays the cry, says the name, and shows the colour pixel. Shuffle draws a new fifty.
- **Collections.** Mega Evolutions, Gigantamax, Alolan, Hisuian, Legendary, and Mythical. One track for each form or Pokémon. The page and the Yoto icon use that form's picture. A regional, Mega, or Gigantamax track does not reuse the original species icon.
- **Catalogue.** Look up any Pokémon from Kanto to Paldea. Tick the ones you want, in the order you want them, and build your own playlist. Facts reads the name and the first two biology paragraphs from Bulbapedia. Advanced facts also reads the size, the type, the ability, and how it evolves. Who's That Pokémon uses two tracks for each Pokémon, so 50 fit on a card.
- **Music.** Songs from the games. Play them on the page, add them to a playlist, reorder the list, then send it to Yoto as MP3s. A song about one Pokémon can use that species' pixel on the card.
- **Voices and sound.** Lily is the usual voice. George, Brian, and Adam are the other Yoto voices. **Piper — Pokédex** sounds like a device reading a Pokédex entry. Each voice has a Hear button on the page so you can sample it. The first time you pick Piper, Pokefacts downloads that voice. Make this card asks for the voice and the playlist before it records. One panel also sets how loud the cry is, how loud the voice is, the pause after the cry, and metric or imperial units.
- **Stickers.** **Print stickers** is on Facts, Who's That, Collections, and a Catalogue pick. Pick a tile pattern — square, rectangle, circle, or hex — then tap a Pokémon, a Poké Ball, or a berry. Each one fills the next tile. Drag to swap places. Bigger and Smaller scale the whole pattern. Draw on the card, with an eraser and a clear. Undo steps back. Save a PDF at real Yoto card size on A4 or US Letter, print at 100% or Actual size, and cut on the corner marks. Do not choose Fit to page. When the names will not fit at a readable size, the back is a note instead. Who's That leaves the names off the back and keeps the shadow pictures.

## What you need

- A computer. A laptop is fine. It has to stay on while the cards are made.
- The Yoto app on your phone, and a Yoto player.
- Blank Make Your Own cards. The full set of facts uses 11 cards. Who's That uses one more.
- About an hour the first time, if you run it on your own computer. Later visits are much shorter.

If you use the website, skip the install steps and start at **Connect your Yoto account**.

## 1. Download Pokefacts

On this page, click the green **Code** button, then **Download ZIP**.

Find the downloaded file and unzip it. On Windows, right-click the file and choose **Extract All**. On a Mac, double-click the file. You get a folder called `pokefacts-main`. Put that folder somewhere you can find again, such as your Desktop.

## 2. Install Node.js

Node.js is the free program that runs Pokefacts.

1. Go to [nodejs.org](https://nodejs.org/).
2. Download the installer for version **22** or newer.
3. Open the downloaded installer and click through it. The normal choices are fine.
4. When it finishes, close any old instruction windows you had open. A new window is required so the computer can see Node.js.

## 3. Install ffmpeg

ffmpeg is the free program that joins the Pokémon cry to the spoken fact.

**On Windows**

1. Click the Start button and type `Command Prompt`.
2. Open **Command Prompt**. A window with text appears. This window is how you give the computer a written instruction.
3. Copy this line, paste it into the window, and press Enter:

```
winget install Gyan.FFmpeg
```

4. If Windows asks whether you trust the source, agree.
5. Wait until the typing line comes back. Then close the window.

**On a Mac**

ffmpeg is installed with a helper called Homebrew.

1. Open **Terminal**. You can find it with Spotlight: press Command and the space bar, type `Terminal`, and press Return.
2. If you have never installed Homebrew, go to [brew.sh](https://brew.sh/) and follow the one install line at the top of that page. Paste it into Terminal and press Return.
3. Then paste this line and press Return:

```
brew install ffmpeg
```

Wait until the typing line comes back.

Pokefacts can also read with Piper, a voice that sounds like a device reading a Pokédex entry. The voice in the list is **Piper — Pokédex** (Cori, British English). The first time you pick it, Pokefacts downloads the official Piper program for this computer — Windows or Linux — and that voice into `data/piper`. Those files are large, so they are not part of the download of Pokefacts itself. Hear works before you connect Yoto. Send still needs a Yoto login. The public site reads Piper on the server, not in your browser.

You can download Piper ahead of time. In the Pokefacts folder, type:

```
npx tsx scripts/install-piper.ts
```

## 4. Open the instruction window inside the Pokefacts folder

You need the window to be looking at the `pokefacts-main` folder. Otherwise the later commands cannot find Pokefacts.

**On Windows**

1. Open the `pokefacts-main` folder.
2. Click the address bar at the top, where the folder location is written.
3. Type `cmd` and press Enter.

A window opens, already in the right folder.

**On a Mac**

1. Open Terminal.
2. Type `cd` and then a space. Do not press Return yet.
3. Drag the `pokefacts-main` folder onto the Terminal window. The folder location appears after `cd`.
4. Press Return.

## 5. Set up Pokefacts

In that same window, type this and press Enter:

```
npm install
```

A lot of text will scroll by. That is normal. Wait until the typing line comes back and the window sits still.

## 6. Start Pokefacts

Type this and press Enter:

```
npm start
```

Leave this window open the whole time you are using Pokefacts. Closing it, or pressing the X, turns Pokefacts off.

When the window settles, open the web browser you normally use. Chrome, Edge, and Safari all work. Click the address bar and type:

```
http://127.0.0.1:3847
```

Press Enter. Pokefacts opens.

That address is your own computer. It is not a public website, and other people cannot open it. The page only works while the instruction window is still running.

## 7. Connect your Yoto account

You do this once. It lets Pokefacts put playlists into your library.

1. In Pokefacts, click **Connect Yoto**.
2. Open [dashboard.yoto.dev](https://dashboard.yoto.dev/) in another tab and sign in with the same account you use for the Yoto app.
3. Create a new app and choose **public**. Public means there is no secret password to copy. If the page offers public or confidential, choose public.
4. Copy the **client ID**. It is a long code for that app. Paste it into the Client ID box in Pokefacts.
5. On the Yoto dashboard page for that app, add the callback address Pokefacts shows. It has to match exactly. On your own computer it is:

```
http://127.0.0.1:3847/callback
```

On the website it is:

```
https://pokefacts.online/callback
```

The page has a **Copy** button for the address that matches the site you have open.

6. Click **Continue to Yoto**. Sign in if Yoto asks. Then approve the permissions.

Those permissions let Pokefacts create playlists in your library, see that library, stay signed in, and read your name. They do not give Pokefacts your password.

7. The browser comes back to Pokefacts. The header shows your Yoto name when the connection worked. Disconnect is behind that name, so one tap does not sign you out.

## 8. Send the fact cards

1. Open **Facts**.
2. Under **Make this card**, click **Send all** for every Pokefacts playlist.

Leave the computer alone while this runs. Each Pokémon is recorded on its own, so the full set takes a long time. The page tells you how far along it is. The instruction window has to stay open until the page says the playlists are ready.

A smaller choice is also there: **100 Pokémon drawn at random**. Shuffle picks a new hundred. Send uses the hundred on the page.

## 9. Put a playlist onto a real card

On your phone, open the Yoto app.

1. Go to **Make Your Own**.
2. Find **Pokefacts 1**.
3. Choose **Link to a card**.
4. Put a blank Make Your Own card in the player when the app asks.

Do the same for Pokefacts 2 through Pokefacts 11. Each playlist needs its own blank card. Together they cover every Pokémon.

## Catalogue

Open **Catalogue** to look up one Pokémon, or to build a playlist from a pick.

Tick the species in the order you want them played. Choose Facts, Advanced facts, or Who's That Pokémon. Type a title if you want one. Send that card to your Yoto library.

A Yoto playlist holds 100 tracks. Who's That Pokémon uses two tracks each, so 50 species fit. A longer pick is not sent as one playlist.

## Collections

Open **Collections**, then pick Mega, Gigantamax, Alolan, Hisuian, Legendary, or Mythical. Hear one on the page, then **Make this card**.

## Music

Open **Music**. Play a song on the page, add it to your playlist, move songs up or down, then send the list to Yoto. The public site does not download YouTube on the server. If you run Pokefacts on this computer, that machine saves the MP3 and the server uploads it to Yoto.

## Stickers

**Print stickers** is next to Send on Facts, Who's That, Collections, and a Catalogue pick.

Pick a tile pattern, then tap a picture, a Poké Ball, or a berry. Each one fills the next tile. Drag a sticker to swap its place. Draw on the card if you want. Printing is a separate step: check the sheet, save the PDF, then print at 100% size and cut on the corner marks.

Choose A4 or US Letter. Save PDF stores the file on your computer. Print it at 100% or Actual size. Do not choose Fit to page. Cut on the corner marks. The left sticker is the front. The right sticker is the back.

A catalogue pick that needs more than one card prints one row per card. Previous sheet and Next sheet move through the pages. The saved PDF has every page.

## Who's That

Open **Who's That**. You get 50 riddles, which is one card. Shuffle draws a new fifty.

Each riddle is two tracks. The clue plays the cry and does not say the name. Its picture is a black shape on white. The answer plays the cry and says the name. Its picture is the real pixel.

Send it the same way as the fact cards, then link it to one blank card in the Yoto app.

## When you want to stop

Click the instruction window so it is the active window.

- On Windows, press Ctrl and C together.
- On a Mac, press Control and C together.

The next time you want Pokefacts, open the instruction window in the `pokefacts-main` folder again and type:

```
npm start
```

Then open `http://127.0.0.1:3847` in your browser. You do not need to install Node.js or ffmpeg again.

## If it does not work

**The window says npm is not recognized.** Node.js is missing, or the window was already open before you installed it. Close the window, open a new one in the Pokefacts folder, and try again.

**The browser page will not open.** Check that the instruction window is still on `npm start`, and that the address is `http://127.0.0.1:3847`.

**The window says ffmpeg is missing.** Do the ffmpeg step again, close the window, open a new one in the folder, and type `npm start`.

**Yoto sends you back to an error.** The callback address on the Yoto dashboard has to match the site you are using. On your own computer that is `http://127.0.0.1:3847/callback`. On the website that is `https://pokefacts.online/callback`. Fix it there, then click **Continue to Yoto** again.

## Support

Pokefacts is free and will stay free. If it is useful, [buy me a coffee](https://buymeacoffee.com/kreeyate).

<p align="center">
  <a href="https://buymeacoffee.com/kreeyate">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="72">
  </a>
</p>

## Where the words and pictures come from

The names, the Pokédex lines, the types, the size, and the pictures come from the Pokémon games by way of [PokéAPI](https://pokeapi.co/). A few Pokémon also have a short note written for Pokefacts.

The species page can show a Biology section from [Bulbapedia](https://bulbapedia.bulbagarden.net/). That text is used under [CC BY-NC-SA 2.5](https://creativecommons.org/licenses/by-nc-sa/2.5/). A catalogue Facts or Advanced facts playlist reads the opening of that section aloud. The built-in Pokefacts cards read a short description from the games instead.
