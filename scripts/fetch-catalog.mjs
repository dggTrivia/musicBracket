// Fetch public factual album/track metadata only. No audio or video is downloaded.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artists = [
  ["kanye-west", "Kanye West", 2715720],
  ["kid-cudi", "Kid Cudi", 273058501],
  ["frank-ocean", "Frank Ocean", 442122051],
  ["kendrick-lamar", "Kendrick Lamar", 368183298],
  ["the-beatles", "The Beatles", 136975],
  ["queen", "Queen", 3296287],
  ["michael-jackson", "Michael Jackson", 32940],
  ["abba", "ABBA", 372976],
  ["rihanna", "Rihanna", 63346553],
];
const cache = path.join(root, "tmp", "itunes");
await mkdir(cache, { recursive: true });
await mkdir(path.join(root, "public", "covers"), { recursive: true });
async function get(url, key) {
  const target = path.join(cache, key + ".json");
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (existing.resultCount > 0) return existing;
  } catch {}
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          "User-Agent": "MusicBracket/1.0 (personal music metadata catalog)",
        },
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      const data = await response.json();
      await writeFile(target, JSON.stringify(data));
      return data;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw last;
}
const discovered = [];
for (const [id, name, appleId] of artists) {
  const response = await get(
    `https://itunes.apple.com/lookup?id=${appleId}&entity=album&limit=200&country=us`,
    "artist-" + id,
  );
  const albums = response.results.filter((x) => x.wrapperType === "collection");
  discovered.push({ id, name, appleId, albums });
  console.log(name + ": " + albums.length + " releases");
  if (process.argv.includes("--discover"))
    console.log(
      albums
        .map(
          (a) =>
            `${a.collectionId} | ${a.collectionName} | ${a.trackCount} | ${a.releaseDate?.slice(0, 4)}`,
        )
        .join("\n"),
    );
}
await writeFile(
  path.join(cache, "discovered.json"),
  JSON.stringify(discovered, null, 2),
);
if (!process.argv.includes("--discover"))
  console.log("Discovery saved. Use --discover to inspect release IDs.");
