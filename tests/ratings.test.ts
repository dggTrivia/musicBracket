import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRatings, normalizeTitle } from "../scripts/ratings-import.mjs";

test("Carti's @ MEH and Meh keep separate ratings and Spotify evidence", () => {
  assert.notEqual(normalizeTitle("@ MEH"), normalizeTitle("Meh"));
  const songs = ["Meh", "@ MEH"].map((title, index) => ({
    id: String(index),
    title,
    artistIds: ["playboi-carti"],
    albumId: "album",
    quality: 70,
    popularity: 50,
  }));
  const quality = [
    {
      artistId: "playboi-carti",
      title: "Meh",
      rating: 3,
      ratingCount: 100,
      quality: 60,
    },
    {
      artistId: "playboi-carti",
      title: "@ MEH",
      rating: 4,
      ratingCount: 200,
      quality: 80,
    },
  ];
  const popularity = [
    {
      artistId: "playboi-carti",
      title: "Meh",
      streams: 116109895,
      popularity: 65.66,
    },
    {
      artistId: "playboi-carti",
      title: "@ MEH",
      streams: 129174111,
      popularity: 67.01,
    },
  ];
  const output = applyRatings({ songs }, { quality, popularity }).catalog.songs;
  assert.deepEqual(
    output.map((song) => [
      song.quality,
      song.popularity,
      song.popularitySource.streams,
    ]),
    [
      [60, 65.66, 116109895],
      [80, 67.01, 129174111],
    ],
  );
});
