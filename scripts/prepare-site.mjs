import { readFile, rm, writeFile } from "node:fs/promises";

const asset = (name) => new URL(`../dist/${name}`, import.meta.url);
const catalogFile = asset("catalog.json");
const { artists, albums, songs } = JSON.parse(
  await readFile(catalogFile, "utf8"),
);

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
