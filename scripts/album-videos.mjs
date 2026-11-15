// Match official YouTube album playlists using the release title and track overlap.
import { readFile, writeFile, rename } from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";

const catalog = JSON.parse(await readFile("public/catalog.json", "utf8"));
const indexPath = "public/video-sources.json";
const data = JSON.parse(await readFile(indexPath, "utf8"));
const normalize = (title) =>
  normalizeTitle(
    title
      .replace(/blkkk\s+skkkn\s+head/gi, "Black Skinhead")
      .replace(/ni\*\*as/gi, "niggas")
      .replace(
        /\s*[([][^)\]]*(?:official|video|audio|explicit|deluxe|anniversary)[^)\]]*[)\]]/gi,
        "",
      ),
  );
const key = (artist, title) => `${artist}:${normalize(title)}`;
const records = new Map(
  data.sources.map((row) => [key(row.artistId, row.title), row]),
);
const albumNames = new Map(
  catalog.artists.map((artist) => [artist.id, artist.name]),
);
const pause = () => new Promise((resolve) => setTimeout(resolve, 350));
const youtube = "https://www.youtube.com";
let consecutiveFailures = 0;
const artistFilter = new Set(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--artist="))
    .map((arg) => arg.slice(9)),
);

async function page(url) {
  await pause();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.text();
}
function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const child of Object.values(value))
    if (child && typeof child === "object") visit(child, callback);
}
function titleKey(title, artist) {
  const separator = title.indexOf(" - ");
  if (
    separator > 0 &&
    normalize(title.slice(0, separator)).includes(normalize(artist))
  ) {
    title = title.slice(separator + 3);
  }
  return normalize(title);
}
async function checkpoint() {
  const file = `${indexPath}.tmp`;
  await writeFile(
    file,
    JSON.stringify(
      {
        ...data,
        updatedAt: new Date().toISOString(),
        sources: [...records.values()],
      },
      null,
      2,
    ),
  );
  await rename(file, indexPath);
}
for (const album of catalog.albums) {
  const artistId = album.artistIds[0];
  if (artistFilter.size && !artistFilter.has(artistId)) continue;
  const artist =
    album.id === "ka-orpheus-vs-the-sirens"
      ? "Hermit and the Recluse"
      : artistId === "ka"
        ? "Brownsville Ka"
        : album.id === "mf-doom-madvillainy"
          ? "Madvillain"
          : album.id === "mf-doom-vaudeville-villain"
            ? "Viktor Vaughn"
            : album.id === "mf-doom-take-me-to-your-leader"
              ? "King Geedorah"
              : albumNames.get(artistId);
  const songs = catalog.songs.filter((song) =>
    song.albumIds.includes(album.id),
  );
  if (songs.every((song) => records.has(key(artistId, song.title)))) continue;
  try {
    const query = `${artist} ${album.title} full album`;
    const search = await page(
      `${youtube}/results?search_query=${encodeURIComponent(query)}`,
    );
    const candidates = [
      ...new Set(
        [...search.matchAll(/"playlistId":"(OLAK5uy[\w-]+)"/g)].map(
          (match) => match[1],
        ),
      ),
    ].slice(0, 3);
    let best = [];
    let bestUrl = "";
    for (const candidate of candidates) {
      const url = `${youtube}/playlist?list=${candidate}`;
      const html = await page(url);
      const initial = html.match(/ytInitialData\s*=\s*(\{.*?\});/s);
      if (!initial) continue;
      const tracks = [];
      visit(JSON.parse(initial[1]), (item) => {
        const modern = item.lockupViewModel;
        const older = item.playlistVideoRenderer;
        const id = modern?.contentId ?? older?.videoId;
        const title =
          modern?.metadata?.lockupMetadataViewModel?.title?.content ??
          older?.title?.runs?.map((run) => run.text).join("");
        if (/^[\w-]{11}$/.test(id || "") && title) tracks.push({ id, title });
      });
      const matches = songs.flatMap((song) => {
        const track = tracks.find(
          (track) => titleKey(track.title, artist) === normalize(song.title),
        );
        return track ? [{ song, track }] : [];
      });
      if (matches.length > best.length) {
        best = matches;
        bestUrl = url;
      }
      if (best.length >= songs.length * 0.8) break;
    }
    consecutiveFailures = 0;
    if (
      best.length <
      Math.min(songs.length, Math.max(3, Math.ceil(songs.length * 0.42)))
    )
      continue;
    let added = 0;
    for (const { song, track } of best) {
      const id = key(artistId, song.title);
      const existing = records.get(id);
      if (existing && existing.youtubeId === track.id) continue;
      if (existing && existing.oembedStatus === 200) {
        if (!existing.backupYoutubeId) existing.backupYoutubeId = track.id;
        continue;
      }
      records.set(id, {
        artistId,
        title: song.title,
        youtubeId: track.id,
        videoTitle: track.title,
        sourceUrl: bestUrl,
        retrievedAt: new Date().toISOString(),
        verification:
          "Matched by title to the official album playlist. Embedding checked at playback.",
      });
      added++;
    }
    console.log(
      `${artist} · ${album.title}: ${best.length}/${songs.length} matched, ${added} new links`,
    );
    await checkpoint();
  } catch (error) {
    console.error(`${album.title}: ${error.message}`);
    if (++consecutiveFailures >= 4 || /HTTP (403|429)/.test(error.message))
      break;
  }
}
await checkpoint();
