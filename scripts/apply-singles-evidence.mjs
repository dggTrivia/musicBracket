import fs from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";
import { reviewedSingleTracks } from "./reviewed-singles.mjs";
const file = "public/ratings.json";
const ratings = JSON.parse(await fs.readFile(file, "utf8"));
for (const [artistId, tracks] of Object.entries(reviewedSingleTracks))
  for (const track of tracks) {
    for (const [field, row] of [
      ["quality", track.quality],
      ["popularity", track.popularity],
    ]) {
      if (!row) continue;
      const key = normalizeTitle(track.title);
      const existing = ratings[field].find(
        (r) =>
          !r.albumId &&
          r.artistId === artistId &&
          normalizeTitle(r.title) === key,
      );
      if (!existing) ratings[field].push(row);
      else if (field === "popularity" && row.streams > existing.streams)
        Object.assign(existing, row);
    }
  }
ratings.updatedAt = new Date().toISOString().slice(0, 10);
await fs.writeFile(file, JSON.stringify(ratings, null, 2) + "\n");
console.log(
  "Merged approved singles evidence; existing measurements retained.",
);
