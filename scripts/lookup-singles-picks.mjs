import fs from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";
const picks = JSON.parse(
  await fs.readFile("tmp/singles-audit/approved-picks.json", "utf8"),
);
const file = "tmp/singles-audit/final-metadata.json";
let results = {};
try {
  results = JSON.parse(await fs.readFile(file, "utf8"));
} catch {}
const earlier = JSON.parse(
  await fs.readFile("tmp/singles-audit/release-review.json", "utf8"),
);
for (const [key, row] of Object.entries(earlier))
  if (!results[key]?.releases?.length && row.releases?.length)
    results[key] = row;
let pendingWrites = Promise.resolve();
const queue = picks.flatMap((artist) =>
  artist.decisions
    .filter((d) => d.status === "approved-for-metadata-check")
    .map((pick) => ({ artist, pick })),
);
let cursor = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < queue.length) {
      const { artist, pick } = queue[cursor++];
      const key = artist.artistId + ":" + normalizeTitle(pick.title);
      if (results[key]?.releases?.length) continue;
      try {
        const url =
          "https://itunes.apple.com/search?" +
          new URLSearchParams({
            term: artist.name + " " + pick.title,
            entity: "song",
            limit: "12",
            country: "us",
          });
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error("HTTP " + response.status);
        const data = await response.json();
        results[key] = {
          artist: artist.name,
          title: pick.title,
          retrievedAt: new Date().toISOString(),
          releases: data.results
            .filter(
              (r) =>
                normalizeTitle(r.trackName ?? "") ===
                normalizeTitle(pick.title),
            )
            .map((r) => ({
              artist: r.artistName,
              title: r.trackName,
              collection: r.collectionName,
              collectionId: r.collectionId,
              trackId: r.trackId,
              releaseDate: r.releaseDate,
              url: r.trackViewUrl,
            })),
        };
        pendingWrites = pendingWrites.then(() =>
          fs.writeFile(file, JSON.stringify(results, null, 2)),
        );
        await pendingWrites;
        console.log(key + ": " + results[key].releases.length);
      } catch (e) {
        console.log(key + ": " + e.message);
        if (/429|403/.test(e.message)) process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  }),
);
await fs.writeFile(file, JSON.stringify(results, null, 2));
