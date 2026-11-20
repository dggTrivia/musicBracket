import { readFile, rm, writeFile } from "node:fs/promises";
import {
  minimumSingleRatingCount,
  maximumSinglesPerArtist,
} from "./ratings-import.mjs";

const asset = (name) => new URL(`../dist/${name}`, import.meta.url);
const catalogFile = asset("catalog.json");
const { artists, albums, songs } = JSON.parse(
  await readFile(catalogFile, "utf8"),
);
const singlesIds = new Set(
  albums.filter((album) => album.singles).map((album) => album.id),
);
for (const id of singlesIds) {
  if (
    songs.filter((song) => song.albumIds.includes(id)).length >
    maximumSinglesPerArtist
  )
    throw Error(`${id} exceeds the ${maximumSinglesPerArtist}-single limit.`);
}
for (const song of songs) {
  if (!song.albumIds.some((id) => singlesIds.has(id))) continue;
  const { provider, ratingCount } = song.qualitySource ?? {};
  if (
    provider !== "Rate Your Music" ||
    !(ratingCount >= minimumSingleRatingCount)
  ) {
    throw Error(
      `${song.title} needs at least ${minimumSingleRatingCount} RYM ratings for Singles.`,
    );
  }
}

// The complete source records stay in the repository for catalog maintenance.
const playableCatalog = {
  artists: artists.map(({ id, name }) => ({ id, name })),
  albums: albums.map(
    ({
      id,
      artistIds,
      title,
      credit,
      year,
      cover,
      singles,
      defaultSelected,
    }) => ({
      id,
      artistIds,
      title,
      credit,
      year,
      cover,
      singles,
      defaultSelected,
    }),
  ),
  songs: songs.map(
    ({
      id,
      title,
      artistIds,
      albumIds,
      albumId,
      duration,
      kind,
      quality,
      popularity,
      popularitySource,
      scoreSource,
      youtubeId,
      backupYoutubeId,
    }) => ({
      id,
      title,
      artistIds,
      albumIds,
      albumId,
      duration,
      kind,
      quality,
      popularity,
      streamCount:
        Number.isSafeInteger(popularitySource?.streams) &&
        popularitySource.streams >= 0
          ? popularitySource.streams
          : undefined,
      scoreSource,
      youtubeId,
      backupYoutubeId,
    }),
  ),
};

await writeFile(catalogFile, JSON.stringify(playableCatalog));
await Promise.all(
  ["ratings.json", "video-sources.json"].map((name) =>
    rm(asset(name), { force: true }),
  ),
);
