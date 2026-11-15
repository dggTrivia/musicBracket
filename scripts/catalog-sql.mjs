import { mkdir, readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const sqlValue = (value) => {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
};
const statements = [];
function add(table, columns, values) {
  statements.push(
    `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${values.map(sqlValue).join(",")});`,
  );
}
for (const artist of catalog.artists) {
  add("artists", ["id", "name"], [artist.id, artist.name]);
}
for (const album of catalog.albums) {
  add(
    "albums",
    ["id", "title", "release_year", "cover_key", "default_selected"],
    [
      album.id,
      album.title,
      album.year,
      album.cover,
      album.defaultSelected === false ? 0 : 1,
    ],
  );
  for (const artistId of album.artistIds) {
    add("album_artists", ["album_id", "artist_id"], [album.id, artistId]);
  }
}
for (const song of catalog.songs) {
  add(
    "songs",
    ["id", "title", "canonical_album_id", "duration_seconds", "kind"],
    [song.id, song.title, song.albumId, song.duration ?? null, song.kind],
  );
  for (const artistId of song.artistIds) {
    add("song_artists", ["song_id", "artist_id"], [song.id, artistId]);
  }
  for (const albumId of song.albumIds) {
    add("album_tracks", ["album_id", "song_id"], [albumId, song.id]);
  }
  for (const dimension of ["quality", "popularity"]) {
    const evidence = song[`${dimension}Source`];
    add(
      "song_scores",
      [
        "song_id",
        "dimension",
        "value",
        "raw_value",
        "rating_count",
        "source_url",
        "estimated",
        "retrieved_at",
      ],
      [
        song.id,
        dimension,
        song[dimension],
        evidence?.rating ?? evidence?.streams ?? null,
        evidence?.ratingCount ?? null,
        evidence?.url ?? null,
        evidence?.url ? 0 : 1,
        evidence?.retrievedAt ?? catalog.updatedAt,
      ],
    );
  }
  for (const [priority, videoId] of [
    song.youtubeId,
    song.backupYoutubeId,
  ].entries()) {
    if (!videoId) continue;
    add(
      "video_sources",
      ["song_id", "priority", "video_id", "evidence"],
      [song.id, priority, videoId, song.videoSource?.url ?? null],
    );
  }
}
await mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../tmp/catalog-seed.sql", import.meta.url),
  statements.join("\n"),
);
console.log(
  `Wrote tmp/catalog-seed.sql with ${catalog.artists.length} artists, ${catalog.albums.length} albums, and ${catalog.songs.length} songs.`,
);
