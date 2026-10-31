# Saved Feed

Turn your Instagram saved posts into a calm, daily, swipeable feed.

Each day you pick one category (or **All**), then scroll a full-screen, Reels-style feed of your saves, using Instagram's official embeds. The order is a seeded shuffle of today's date + the category, so it stays put all day and reshuffles tomorrow.

Everything lives in your browser (IndexedDB). There's no backend and no account.

> Beta. Runs on your laptop and your phone over Wi‑Fi, and is set up as an installable PWA for later hosting.

## Features

- **Import your Instagram export.** Drop the `.zip`, the unzipped folder, or just `saved_posts.json` / `saved_collections.json`. It handles the old and new export formats, duplicates, `/p/`, `/reel/`, `/reels/` and `/tv/` links, and Instagram's garbled emoji/accents. Media files in the zip are ignored.
- **Collections become categories.** You can create, rename and delete categories, and put any post in several.
- **Daily feed.** Full-height snap scrolling. Only the current post and its neighbors are mounted. Reopening resumes where you left off in each category.
- **Dead links handled.** A deleted or private post is detected and skipped automatically. You can also flag one yourself. Review, restore or remove them under **Settings → Unavailable posts**.
- **Library.** Browse everything, filter by category or type, search by account, multi-select and bulk-assign categories.
- **Backup.** Export your whole library (posts, categories, flags) as one JSON file and import it on another device, either merged or replacing.
- **PWA.** Installable, works offline (the app shell; embeds need a connection).

## Run it on your laptop

You need [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and import your export.

## Autoplaying videos (optional)

By default the feed uses Instagram's embeds. Those never autoplay, and Instagram sends some reels (often ones with licensed music) to instagram.com instead of playing them. With this set up, reels and video posts play in the app's own player instead: they autoplay as you scroll, start muted (a browser rule), and one tap on **Tap for sound** keeps sound on. Photos and carousels still use the embed, and anything that can't be fetched falls back to it.

It works by having `npm run dev` / `npm run preview` look up each video with [yt-dlp](https://github.com/yt-dlp/yt-dlp), logged in as an Instagram account. This uses unofficial access to Instagram, so it can break when Instagram changes things, and the account could get rate-limited or flagged. **Use a spare account, not your main one.** It doesn't need any saved posts; it only needs to be able to see them.

1. `brew install yt-dlp`
2. Log into the spare account in a separate browser profile (in Arc: a new Space with **Create new profile**).
3. Install the **Get cookies.txt LOCALLY** extension in that profile. On instagram.com, export cookies **for the current site only** (not "Export All").
4. Save the file as `.secrets/ig-cookies.txt` in this folder. `.secrets/` is git-ignored. Treat the file like a password.
5. Restart `npm run dev`.

When the login expires (every few weeks), the feed shows a message and falls back to embeds. Repeat steps 3–4.

### Videos on the deployed site (Vercel)

On Vercel, the same lookup runs as a serverless function (`api/video.py`), so the deployed site plays videos without your computer being on and without visitors installing anything. It needs the spare account's login as an environment variable:

1. Copy the login, encoded: `base64 -i .secrets/ig-cookies.txt | pbcopy`
2. In Vercel → your project → Settings → Environment Variables, add `IG_COOKIES_B64` with that value (Production, and Preview if you want). Mark it Sensitive.
3. Redeploy.

When the login expires, repeat with a fresh cookies file. Check it any time by opening `/api/video/<shortcode>` on your site: `"type": "video"` means it works, `"reason": "login-expired"` means it needs a new login, `"no-login"` means the variable isn't set.

Instagram sometimes challenges logins coming from cloud servers. If lookups start failing, log into the spare account in a browser, clear any security prompt, and export fresh cookies.

Not on Vercel? `npm run video-server` runs the same API as a plain Node server (`server/standalone.ts`). Host it anywhere with yt-dlp installed, set `ALLOWED_ORIGINS` to your site's address, and build the app with `VITE_VIDEO_API_URL` pointing at it.

## Open it on your phone (same Wi‑Fi)

`npm run dev` also listens on your local network and prints a **Network** URL, e.g.:

```
➜  Network: http://192.168.1.23:5173/
```

Open that URL on your phone. If it doesn't load, allow incoming connections for Node in your Mac's firewall prompt.

Your phone has its own separate library. To move your data over:

1. On your laptop: **Settings → Download backup**.
2. Get the file to your phone (AirDrop, email, Files…).
3. On your phone: **Settings → Restore from a backup file** (or "Restore a Saved Feed backup" on the welcome screen).

You can also just import the Instagram export directly on the phone.

### Installing to the home screen

Phones only allow offline mode and "Add to Home Screen" as a real app over **HTTPS** (or on localhost). Over plain `http://192.168…` everything else works, but it won't install as an app. To try installation on your LAN:

```bash
npm run dev:https
```

Open the `https://192.168…:5173` URL, accept the self-signed certificate warning, then use Share → Add to Home Screen (iOS) or Install app (Android). For everyday phone use, deploy it (below).

## Getting your Instagram export

1. Instagram → **Settings → Accounts Center → Your information and permissions → Download your information**.
2. Choose **Some of your information** → tick **Saved**.
3. **Format: JSON** (not HTML). Any date range and media quality.
4. Download the `.zip` from the email and drop it into the app.

### Checking what's in your export

Put your export (zip or folder) in `sample-data/`; it's git-ignored. Then run:

```bash
npm run inspect                    # scans ./sample-data
npm run inspect -- ~/Downloads/instagram-xyz.zip
```

It prints the structure of each saved-posts file and what the parser extracts: post counts, collections, duplicates, date range. Usernames are masked.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on localhost and your LAN |
| `npm run dev:https` | Same, over HTTPS with a self-signed cert (for PWA testing on a phone) |
| `npm run build` | Type-check and build to `dist/` (includes the service worker) |
| `npm run preview` | Serve the production build on localhost:4173 and your LAN |
| `npm test` | Parser, shuffle, feed and backup tests (Vitest) |
| `npm run inspect` | Inspect an Instagram export (see above) |
| `npm run icons` | Regenerate PWA icons from `public/favicon.svg` |

## Deploying later

`npm run build` outputs a static site in `dist/`. Routes use the URL hash, so it works on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) with no rewrite rules. Once it's on HTTPS, open it on your phone and add it to the home screen.

## How it works

```
src/
  lib/
    parser.ts         Instagram export → posts + collections (format-tolerant)
    instagramUrl.ts   Shortcode/type from URLs, embed URLs
    exportFiles.ts    Reads picked files, folders and .zip (via fflate)
    shuffle.ts        cyrb53 hash + mulberry32 PRNG + Fisher–Yates
    feed.ts           Category filter + daily shuffle, then drop dead posts
    library.ts        Merging imports, backup format and validation
    db.ts             IndexedDB (posts, categories, meta) via idb
  state/              React context for the library, hash router, display settings
  components/         Media (own video player or embed), Embed, sheets, category picker, import panel, tab bar
  screens/            Onboarding, DayPicker, Feed, Library, Categories, Settings
server/videoApi.ts    /api/video/:shortcode, backed by yt-dlp (runs inside dev/preview)
server/standalone.ts  Same API as its own Node server, for non-Vercel hosts
api/video.py          Same lookup as a Vercel function (the deployed site uses this)
tests/                Vitest specs; synthetic exports live in fixtures/
scripts/              inspect-export.ts
```

**Dead-link detection.** Instagram's embed iframe sends `LOADING`, `MEASURE {height}` and `MOUNTED` messages to the page when a post renders. A deleted or private post loads Instagram's "link may be broken" page and never sends `MEASURE`/`MOUNTED`. So if the iframe finishes loading and nothing mounts within 4 seconds, the post is marked unavailable. If the device is offline it shows a retry instead of blaming the post. The `MEASURE` height is also used to scale each post to fit the screen.

**Shuffle stability.** The feed shuffles every post in the category (dead ones included) and *then* filters out dead ones. Marking a post unavailable therefore never reorders the rest of today's feed.

## Privacy

Your export and library never leave your device. The only network requests are Instagram's own embeds, loaded from instagram.com when a post is on screen, and, if you set up autoplaying videos, the video server's yt-dlp lookups to Instagram (from your computer, or from Vercel on the deployed site) using your spare account's login. `sample-data/` is git-ignored so your real export can't be committed by accident.

Not affiliated with Instagram or Meta.
