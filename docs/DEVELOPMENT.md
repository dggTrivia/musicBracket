# MusicBracket development guide

Technical context for contributors and coding agents. See the root README for player setup.

## Code map and verification

- `src/App.tsx` owns setup, artist selection, matchups, replay invitations, share dialogs and results.
- `src/engine.ts` builds the frozen tournament, balances mixed artist slots, validates imported definitions and applies picks.
- `src/Player.tsx` owns the YouTube IFrame API, playback switching, fallback videos and Restart.
- `src/share.ts` creates short replay links on the hosted site and portable compressed links on localhost. Preserve the original bracket tree and never include personal picks.
- `functions/api/brackets.ts`, `functions/api/brackets/[id].ts`, and `server/brackets.ts` store and retrieve immutable replay snapshots through the `BRACKETS` D1 binding.
- `src/storage.ts` stores active runs and image-only completed history in IndexedDB.
- `src/exports.ts` draws full-bracket and final-stage PNGs.
- `src/types.ts` defines the persisted formats. New optional options must remain compatible with older saves.
- `Start-MusicBracket.ps1` and `Play-MusicBracket.bat` provide Windows setup and launch.

Run `pnpm test` and `pnpm build` after engine, sharing or application changes. Test UI changes on a separate named loopback hostname to keep the player's saved runs untouched. Verify the normal UI entry points, mobile layout, dark mode and save/resume when affected.

The visual system uses warm parchment, espresso text, moss controls, Fraunces headings and DM Sans labels. Preserve the side-by-side song/video layout, smaller album covers, fixed menu opener and round announcements.

## Playback options

New brackets can enable **Start songs at 40 seconds**. Store this optional choice in the bracket definition so saves and shared replays keep it. Tracks with a known duration of 40 seconds or less start at zero. Restart always seeks to zero. Old definitions default to the beginning.

A local-first music tournament in the approved **Soul Paper** theme. React + TypeScript + Vite, self-hosted fonts, 26 artist catalogs, real YouTube embeds, no login or API key needed to play.

## Play on Windows

1. Download this repository using **Code → Download ZIP**, then extract the ZIP.
2. Double-click **Play-MusicBracket.bat** inside the extracted folder.
3. The launcher sets up dependencies and opens MusicBracket in your default browser. Keep its window open while playing.

First launch needs an internet connection. If needed, the launcher downloads a checksum-verified portable Node.js into the project folder. Administrator access and a separate Node.js or pnpm installation are unnecessary. Later launches reuse the setup. YouTube playback always needs internet access.

Your brackets and history are saved in that browser. Opening the launcher again reopens the existing server. If another application uses port 19473, the launcher asks you to close it.

## Development and macOS/Linux

Requires Node.js 22.18+ and pnpm.

```sh
pnpm install
pnpm dev
```

Open http://musicbracket.localhost:19473/. Use this hostname for inline playback because YouTube can reject music embeds from a raw loopback IP. The server binds to loopback on port 19473.

When debugging a blocked embed, test the **same YouTube video ID** from a named local origin before replacing it. In MusicBracket, standard YouTube iframes that failed on `127.0.0.1` loaded on `musicbracket.localhost`, and actual inline playback was verified on the named origin. Keep the embed's referrer available and pass the embedding page's actual origin when using the IFrame API. Confirm playback after clicking Play. A watch URL or successful metadata lookup cannot verify an embed, and a hostname change will not restore uploads that the owner has disabled for embedding.

If you played on the old `127.0.0.1` address, its saved runs and history stay there. To move an active run, use **Save backup** on the old address and **Settings → Import backup** on the named address. Download any history images you want to take with you.

```sh
pnpm test
pnpm build
pnpm preview
```

## Play

New bracket starts with an alphabetical artist picker, then shows albums and bracket settings. You can include skits, choose every song or best 8/16/32/64/128, set rounds one and two to up to 2/3/4 songs, and adjust shuffle randomness. The summary shows the actual round sizes. One winner advances from each group; byes advance without a decision. Preview & shuffle inspects the whole opening field. Each round opens with an announcement, including the quarterfinals, semifinals, and final.

Entrant selection and seeding use 60% popularity and 40% quality. A Rate Your Music score requires at least 15 votes. A matched rating below that threshold uses 50/100 for quality, and songs without a match use the existing estimate. Seeding also uses bounded randomness, score-balanced branches and a secondary album-mixing preference. The complete tree is generated before the first pick. Saved runs contain the frozen definition and a sequential decision log. Keys 1–4 choose a song; Space toggles playback lock when focus is outside controls. Undo reverses the most recent decision during play.

Click Play on a video to start listening inside the matchup. Once a song is playing, hover another candidate to switch. Leaving the cards keeps the current video playing. For a stalled or blocked embed, **Open on YouTube** below the player opens its watch page in a new tab. In-app volume adjusts the embedded players. YouTube embeds do not expose measured loudness normalization. Each song supports a preferred video and at most one fallback, editable from the library. Missing or blocked videos never remove a song from the bracket.

## Saves and images

IndexedDB stores up to five active runs plus preferences, video overrides, and completed history. After the final pick, the winner screen stays available for review and snapshot downloads. MusicBracket automatically stores the full bracket and Final 16 PNGs with identifying metadata and removes the completed run in the same transaction. Completed runs from older versions are archived when opened on the same browser address. If rendering or storage fails, retry from History. Download backups and images you want to keep before clearing browser data.

Mixed artists lets you select 2–8 artists, then switch between compact album collections with remembered selections. Smaller fields share slots evenly where possible, choosing each artist's strongest songs with the usual score. A shared collaboration enters once. Every selected song enters when that size is chosen.

Share bracket in Full bracket or on the winner screen creates a short `#b=<16-character-code>` URL on the hosted site. D1 stores the compressed, frozen entrants, videos, and opening matchups. A content hash reuses identical snapshots. Opening the link shows a replay invitation, and Play this bracket saves a fresh run with no picks. Later opponents follow each listener's decisions. Localhost uses portable `#bracket=v1.` links, and existing portable links continue to work. Shared snapshots have no expiration. Anyone with the link can replay the bracket.

Apply `migrations/0002_shared_brackets.sql` to the dedicated `musicbracket-shares` D1 database and bind it as `BRACKETS` on the production Pages project. Functions route only `/api/brackets` and `/api/brackets/*` through `public/_routes.json`. Other assets remain static. Creation accepts same-origin JSON, limits the request body and decompressed size, validates the whole tournament, strips personal picks, and atomically limits new snapshots to 500 per rolling day. Fetches use immutable browser and edge caching. Failures show an error with a retry button. Include the binding when deploying to another hosted environment. Preview environments have no production database binding.

## Catalog and provenance

The catalog is a versioned static database at `public/catalog.json`, with shared artist/album memberships and canonical-song IDs. Primary/backup playback sources and rating evidence are stored in separate versioned data files. The import scripts document upstream sources and support regenerating data. The library supports importing/merging a catalog JSON file with `artists`, `albums`, and `songs` arrays, adding future artists without application code changes. Personal video/score overrides affect new brackets; existing definitions remain frozen.

To rebuild the database, run `node scripts/catalog-import.mjs`, then `node scripts/ratings-import.mjs --apply` and `node scripts/video-import.mjs --apply`. To extend the source index, `node scripts/album-videos.mjs` matches official YouTube album playlists by track-title overlap and `node scripts/video-import.mjs --search --verify --apply` queries unresolved tracks and checks public video metadata. An upload can still restrict playback by territory or disallow embeds, so the player tries its backup and offers the YouTube watch page.

The Beatles selection uses the 13 canonical albums in the supplied list: Please Please Me, With the Beatles, A Hard Day's Night (UK), Beatles for Sale, Help! (UK only), Rubber Soul (UK), Revolver (UK), Sgt. Pepper's Lonely Hearts Club Band, Magical Mystery Tour, The Beatles, Yellow Submarine, Abbey Road, and Let It Be.

The catalog contains 88 artists, 1,153 albums, and 15,109 canonical tracks. Quality uses Rate Your Music where a matched song meets the minimum vote count. Popularity uses public Spotify stream totals from Kworb and Music Metrics Vault. The player offers a YouTube search when a video could not be matched.

## Cloudflare

The application is a static SPA with no machine-local server dependency in production. `pnpm build` produces `dist/`, deployable to Cloudflare Workers Static Assets or Pages. The `_headers` file preserves the referrer YouTube requires; never replace it with `no-referrer`. `_redirects` provides SPA fallback for Pages. For new Cloudflare projects use the `cf` CLI; `cloudflare.config.ts` records the Worker name, compatibility date and SPA behavior. The GitHub repository deploys to [MusicBracket on Cloudflare Pages](https://musicbracket.pages.dev/) when changes reach `main`.

For Workers: install Cloudflare's `cf` development dependency when enabling deployment, run `cf build` to prepare its Vite integration, review generated configuration, then `cf deploy`. Keep the static SPA entrypoint; no D1/R2 is required merely to publish the current app. See [Cloudflare config](https://developers.cloudflare.com/cf/projects/cloudflare-config/) and [Static Assets](https://developers.cloudflare.com/workers/static-assets/).

For future cross-device saves, apply `migrations/0001_catalog.sql` to a separate D1 database, use R2 for the two history PNGs, add authenticated ownership checks, and replace the storage adapter without changing the tournament engine. `node scripts/catalog-sql.mjs` writes a catalog seed migration to `tmp/`. The shared bracket endpoint contains public replay snapshots only. Personal active runs and history stay in IndexedDB.

`src/chat.ts` is a dormant, tested voting boundary: transport contract, match-scoped deadline checking and one vote per user. `CHAT_VOTING_ENABLED` is false; no chat connection is opened. Enabling it later needs a provider transport, server-authoritative deadlines, identity, anti-replay checks and authenticated session ownership.
