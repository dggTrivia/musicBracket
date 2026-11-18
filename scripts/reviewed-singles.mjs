import { readFileSync } from "node:fs";
// Checked-in evidence makes the approved singles import reproducible offline.
export const reviewedSingleTracks = JSON.parse(
  readFileSync(new URL("./reviewed-singles.json", import.meta.url), "utf8"),
);
export const reviewedSingles = Object.fromEntries(
  Object.entries(reviewedSingleTracks).map(([artistId, tracks]) => [
    artistId,
    [Math.min(...tracks.map((t) => t.year)), [], tracks.map((t) => t.title)],
  ]),
);
