import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTitle } from "../scripts/ratings-import.mjs";
const catalog = JSON.parse(
  readFileSync(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const audit = JSON.parse(
  readFileSync(new URL("../docs/SINGLES_AUDIT.json", import.meta.url), "utf8"),
);
test("the singles audit covers every catalog artist and retains source evidence", () => {
  assert.deepEqual(
    audit.artists.map((a) => a.artistId).sort(),
    catalog.artists.map((a) => a.id).sort(),
  );
  for (const artist of audit.artists) {
    assert.ok(artist.url.startsWith("https://rateyourmusic.com/artist/"));
    assert.ok(artist.releaseCount > 0);
  }
});
test("singles meet the evidence threshold and never duplicate an album title", () => {
  for (const album of catalog.albums.filter((a) => a.singles)) {
    const singles = catalog.songs.filter((s) => s.albumIds.includes(album.id));
    assert.ok(singles.length > 0 && singles.length <= 7, album.id);
    const albumSongs = catalog.songs.filter(
      (s) =>
        s.artistIds.some((id) => album.artistIds.includes(id)) &&
        s.albumIds.some((id) => !id.endsWith("-singles")),
    );
    for (const song of singles) {
      assert.equal(song.qualitySource?.provider, "Rate Your Music", song.id);
      assert.ok(song.qualitySource.ratingCount > 50, song.id);
      assert.match(song.youtubeId, /^[\w-]{11}$/, song.id);
      assert.ok(
        song.qualitySource.url.startsWith("https://rateyourmusic.com/"),
        song.id,
      );
      assert.ok(
        !albumSongs.some(
          (a) =>
            a.id !== song.id &&
            normalizeTitle(a.title) === normalizeTitle(song.title),
        ),
        song.id,
      );
    }
  }
});
test("joint singles reuse one recording across artist selections", () => {
  for (const [title, artistIds] of [
    ["FourFiveSeconds", ["rihanna", "kanye-west"]],
    ["Old English", ["young-thug", "freddie-gibbs"]],
    ["All the Stars", ["kendrick-lamar", "sza"]],
    ["Pray for Me", ["kendrick-lamar", "the-weeknd"]],
  ] as const) {
    const matches = catalog.songs.filter(
      (s) => normalizeTitle(s.title) === normalizeTitle(title),
    );
    assert.equal(matches.length, 1, title);
    for (const id of artistIds)
      assert.ok(matches[0].artistIds.includes(id), title);
  }
});
