// Offline shortlist from the complete RYM artist Singles tables saved in Chrome.
// This produces review evidence only; it never approves or imports recordings.
import fs from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";
const catalog = JSON.parse(await fs.readFile("public/catalog.json", "utf8"));
const ratings = JSON.parse(await fs.readFile("public/ratings.json", "utf8"));
const directory = "tmp/artist-singles";
const files = new Set(await fs.readdir(directory));
const report = [];
for (const artist of catalog.artists) {
  if (!files.has(`${artist.id}.json`)) continue;
  const page = JSON.parse(
    await fs.readFile(`${directory}/${artist.id}.json`, "utf8"),
  );
  const albumTitles = new Set(
    catalog.songs
      .filter(
        (s) =>
          s.artistIds.includes(artist.id) &&
          s.albumIds.some((id) => !id.endsWith("-singles")),
      )
      .map((s) => normalizeTitle(s.title)),
  );
  const popularity = new Map(
    ratings.popularity
      .filter((p) => p.artistId === artist.id)
      .map((p) => [normalizeTitle(p.title), p]),
  );
  const seen = new Set();
  const candidates = page.rows
    .filter((row) => {
      if (row.ratingCount <= 50 || !row.rating || seen.has(row.sourceUrl))
        return false;
      seen.add(row.sourceUrl);
      if (
        /\b(remix|remixes|instrumental|acoustic|live version|re-recorded)\b/i.test(
          row.title,
        )
      )
        return false;
      const titles = row.title.split(/\s+\/\s+/);
      return titles.some((title) => !albumTitles.has(normalizeTitle(title)));
    })
    .map((row) => ({
      ...row,
      missingTitles: row.title
        .split(/\s+\/\s+/)
        .filter((title) => !albumTitles.has(normalizeTitle(title))),
      spotifyStreams:
        popularity.get(normalizeTitle(row.title))?.streams ?? null,
    }))
    .sort((a, b) => b.ratingCount - a.ratingCount);
  report.push({
    artistId: artist.id,
    name: artist.name,
    releaseCount: page.rows.length,
    candidates,
  });
}
const result = {
  updatedAt: new Date().toISOString(),
  reviewedArtists: report.length,
  totalArtists: catalog.artists.length,
  pending: catalog.artists
    .filter((a) => !files.has(`${a.id}.json`))
    .map((a) => a.id),
  artists: report,
};
await fs.mkdir("tmp/singles-audit", { recursive: true });
await fs.writeFile(
  "tmp/singles-audit/artist-shortlist.json",
  JSON.stringify(result, null, 2),
);
console.log(
  `${report.length}/${catalog.artists.length} artist overviews saved`,
);
for (const a of report)
  console.log(
    `${a.name}: ${a.candidates
      .slice(0, 8)
      .map((c) => `${c.title} (${c.ratingCount})`)
      .join("; ")}`,
  );
