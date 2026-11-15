// Merge chart rows saved from RYM in Chrome. Usage: node scripts/import-rym-charts.mjs <directory> <artist-id>...
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyRatings, normalizeTitle } from "./ratings-import.mjs";

const [directory, ...artists] = process.argv.slice(2);
if (!directory || !artists.length)
  throw Error("Supply a chart directory and artist IDs.");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + "\n");
const catalog = await read("public/catalog.json");
const data = await read("public/ratings.json");
const aliases = {
  "hermit-and-the-recluse": "ka-orpheus-vs-the-sirens",
  madvillain: "mf-doom-madvillainy",
  "viktor-vaughn": [
    "mf-doom-vaudeville-villain",
    "mf-doom-vv-2-venomous-villain",
  ],
  "king-geedorah": "mf-doom-take-me-to-your-leader",
  dangerdoom: "mf-doom-the-mouse-and-the-mask",
  "jj-doom": "mf-doom-key-to-the-kuffs",
  d12: ["eminem-devil-s-night", "eminem-d12-world"],
  "bad-meets-evil": "eminem-hell-the-sequel",
  "the-carters": "jay-z-everything-is-love",
};
const key = (record) =>
  `${record.albumId ? `album:${record.albumId}` : record.artistId}:${normalizeTitle(record.title)}`;
const supported = new Set(
  catalog.songs.flatMap((song) => [
    ...song.artistIds.map((artistId) => key({ artistId, title: song.title })),
    key({ albumId: song.albumId, title: song.title }),
  ]),
);
const existing = new Map(data.quality.map((record) => [key(record), record]));
const matches = new Map();
const retrievedAt = new Date().toISOString().slice(0, 10);
const files = (await readdir(directory)).sort((a, b) =>
  a.localeCompare(b, "en", { numeric: true }),
);
for (const filename of files) {
  const id = filename.match(/^(.+)-\d+\.json$/)?.[1];
  if (!artists.includes(id)) continue;
  const page = await read(path.join(directory, filename));
  if (page.artist !== id || new URL(page.url).hostname !== "rateyourmusic.com")
    throw Error(`Invalid chart metadata in ${filename}`);
  for (const row of page.rows) {
    const scopes = [aliases[id]].flat();
    const record = scopes
      .map((albumId) => ({ artistId: id, albumId, title: row.title }))
      .find((candidate) => supported.has(key(candidate)));
    if (!record) continue;
    const slug = key(record);
    if (!supported.has(slug) || matches.has(slug)) continue;
    const rating = Number(row.rating);
    const count = String(row.count).replaceAll(",", "").toLowerCase();
    if (!/^\d+(?:\.\d+)?[km]?$/.test(count) || !(rating > 0 && rating <= 5))
      continue;
    const quantity = Number.parseFloat(count);
    const suffix = count.at(-1);
    const multiplier = suffix === "k" ? 1000 : suffix === "m" ? 1000000 : 1;
    const source = new URL(row.sourceUrl);
    if (
      source.hostname !== "rateyourmusic.com" ||
      !source.pathname.startsWith("/song/")
    )
      continue;
    matches.set(slug, {
      ...existing.get(slug),
      ...record,
      rating,
      ratingCount: Math.round(quantity * multiplier),
      ratingCountDisplay: multiplier === 1 ? undefined : row.count,
      quality: Math.round(rating * 2000) / 100,
      sourceUrl: source.href,
      chartUrl: page.url,
      retrievedAt,
    });
  }
}
data.quality = [...new Map([...existing, ...matches]).values()];
data.updatedAt = retrievedAt;
await save("public/ratings.json", data);
await save("public/catalog.json", applyRatings(catalog, data).catalog);
console.log(`Imported ${matches.size} matching chart entries.`);
