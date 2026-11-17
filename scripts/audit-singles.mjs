/** Prepare a resumable candidate report from saved evidence. No network calls
 * or catalog writes. Usage: node scripts/audit-singles.mjs [--artist=<id>]
 * Fresh RYM browsing and release verification are still required for approval.
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeTitle,
  minimumSingleRatingCount,
  maximumSinglesPerArtist,
} from "./ratings-import.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const catalog = await read("public/catalog.json");
const ratings = await read("public/ratings.json");
const requested = process.argv
  .find((arg) => arg.startsWith("--artist="))
  ?.slice(9);
if (requested && !catalog.artists.some((artist) => artist.id === requested))
  throw Error(`Unknown artist: ${requested}`);

const recordingKey = (title) =>
  normalizeTitle(
    title.replace(
      /\s*[([][^)\]]*\b(?:remix|remaster(?:ed)?|mix|edit|version|live|acoustic|instrumental)\b[^)\]]*[)\]]/gi,
      "",
    ),
  );
const percentile = (values, value) =>
  values.length
    ? Math.round(
        (100 * values.filter((number) => number <= value).length) /
          values.length,
      )
    : null;
const countRatings = (value) => {
  const text = String(value ?? "")
    .replaceAll(",", "")
    .trim()
    .toLowerCase();
  if (!/^\d+(?:\.\d+)?[km]?$/.test(text)) return 0;
  return Math.round(
    parseFloat(text) *
      (text.endsWith("k") ? 1000 : text.endsWith("m") ? 1e6 : 1),
  );
};
const candidates = new Map();
const pages = new Map();
const add = (artistId, title, evidence) => {
  const key = `${artistId}:${normalizeTitle(title)}`;
  const row = candidates.get(key) ?? {
    artistId,
    title,
    quality: [],
    popularity: [],
  };
  if (evidence.ratingCount) row.quality.push(evidence);
  if (evidence.streams) row.popularity.push(evidence);
  candidates.set(key, row);
};
for (const record of ratings.quality) {
  if (!record.albumId) add(record.artistId, record.title, record);
}
for (const record of ratings.popularity) {
  if (!record.albumId) add(record.artistId, record.title, record);
}
const files = (
  await readdir(path.join(root, "tmp"), { recursive: true })
).filter((file) => /rym|chart/i.test(file) && file.endsWith(".json"));
for (const file of files) {
  const page = await read(path.join("tmp", file));
  if (
    !page.artist ||
    !Array.isArray(page.rows) ||
    !page.url?.startsWith("https://rateyourmusic.com/")
  )
    continue;
  const list = pages.get(page.artist) ?? new Set();
  list.add(page.url);
  pages.set(page.artist, list);
  for (const row of page.rows) {
    const rating = Number(row.rating);
    const ratingCount = countRatings(row.count);
    if (
      !(rating > 0 && rating <= 5) ||
      !ratingCount ||
      !row.sourceUrl?.startsWith("https://rateyourmusic.com/song/")
    )
      continue;
    add(page.artist, row.title, {
      rating,
      ratingCount,
      sourceUrl: row.sourceUrl,
      chartUrl: page.url,
      cachedFile: path.join("tmp", file),
    });
  }
}

const artists = catalog.artists
  .filter((artist) => !requested || artist.id === requested)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((artist) => {
    const existing = catalog.songs.filter((song) =>
      song.artistIds.includes(artist.id),
    );
    const existingTitles = new Set(
      existing.map((song) => recordingKey(song.title)),
    );
    const rows = [...candidates.values()].filter(
      (row) => row.artistId === artist.id,
    );
    const knownCounts = rows
      .filter((row) => row.quality.length)
      .map((row) =>
        Math.max(...row.quality.map((source) => source.ratingCount)),
      );
    const existingStreams = existing
      .map((song) => song.popularitySource?.streams)
      .filter((streams) => streams > 0);
    const unresolved = [];
    let alreadyIncluded = 0;
    for (const row of rows) {
      if (existingTitles.has(recordingKey(row.title))) {
        alreadyIncluded++;
        continue;
      }
      const quality = row.quality.sort(
        (a, b) => b.ratingCount - a.ratingCount,
      )[0];
      const popularity = row.popularity.sort(
        (a, b) => b.streams - a.streams,
      )[0];
      const rymPercentile = quality
        ? percentile(knownCounts, quality.ratingCount)
        : null;
      const spotifyPercentile = popularity
        ? percentile(existingStreams, popularity.streams)
        : null;
      const needsRating = !quality;
      if (quality && quality.ratingCount < minimumSingleRatingCount) continue;
      unresolved.push({
        title: row.title,
        status: needsRating ? "needs-rym-rating" : "needs-release-verification",
        rym: quality ?? null,
        spotify: popularity ?? null,
        relativeReach: { rymPercentile, spotifyPercentile },
        review:
          "Confirm a major original single, lead-artist credit, and absence from all included album editions. Percentiles guide review and do not authorize inclusion.",
      });
    }
    unresolved.sort(
      (a, b) =>
        (b.spotify?.streams ?? 0) - (a.spotify?.streams ?? 0) ||
        (b.rym?.ratingCount ?? 0) - (a.rym?.ratingCount ?? 0),
    );
    return {
      id: artist.id,
      name: artist.name,
      status: "awaiting-review",
      cachedChartUrls: [...(pages.get(artist.id) ?? [])],
      rymCoverage: pages.has(artist.id)
        ? "cached-pages-available"
        : "needs-chart-browsing",
      alreadyIncluded,
      candidates: unresolved,
      exceptions:
        artist.id === "playboi-carti"
          ? [
              {
                title: "@ MEH",
                distinctFrom: "Meh",
                videoUrl: "https://www.youtube.com/watch?v=nMDOSLEVdBw",
                note: "Two different songs. Preserve separate catalog IDs, ratings and stream totals.",
              },
            ]
          : [],
    };
  });
const output = path.join(root, "tmp/singles-audit");
await mkdir(output, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    maximumSinglesPerArtist,
    minimumSingleRatingCount,
    noAlbumDuplicates: true,
    relativePopularityRequired: true,
  },
  artists,
};
const filename = requested ? `${requested}.json` : "report.json";
await writeFile(
  path.join(output, filename),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      report: `tmp/singles-audit/${filename}`,
      artists: artists.length,
      withCachedCharts: artists.filter(
        (artist) => artist.cachedChartUrls.length,
      ).length,
      candidates: artists.reduce(
        (total, artist) => total + artist.candidates.length,
        0,
      ),
      ...(requested
        ? {
            shortlist: artists[0].candidates
              .slice(0, 10)
              .map(({ title, status, relativeReach }) => ({
                title,
                status,
                relativeReach,
              })),
          }
        : {}),
    },
    null,
    2,
  ),
);
