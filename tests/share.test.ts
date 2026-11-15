import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDefinition, selectEntrants, validateDefinition } from "../src/engine.ts";
import { challengeSnapshot, createChallengeLink, readChallengeLink } from "../src/share.ts";
import type { BracketOptions, Song } from "../src/types.ts";

const options: BracketOptions = {
  artistId: "a",
  artistAlbums: { a: ["album-a"], b: ["album-b"] },
  albumIds: ["album-a", "album-b"],
  includeInterludes: false,
  size: 8,
  first: 4,
  second: 3,
  randomness: 28,
  seed: 12,
  name: "A shared mix",
};
const songs: Song[] = ["a", "b"].flatMap((artist) =>
  Array.from({ length: 12 }, (_, index) => ({
    id: artist + index, title: artist + index,
    artistIds: [artist], albumId: "album-" + artist, albumIds: ["album-" + artist],
    kind: "song", quality: artist === "a" ? 100 : 40,
    popularity: 100 - index, scoreSource: "fixture",
  })),
);
const definition = () => makeDefinition(options, songs, [
  { id: "album-a", title: "A", year: 2020, artistIds: ["a"], cover: "/record.svg" },
  { id: "album-b", title: "B", year: 2020, artistIds: ["b"], cover: "/record.svg" },
], { id: "mixed", name: "A & B" }, [{ id: "a", name: "A" }, { id: "b", name: "B" }]);

test("mixed fields balance artists, redistribute spare slots and deduplicate collaborations", () => {
  assert.deepEqual([...selectEntrants(options, songs).counts.values()], [4, 4]);
  const available = songs.filter((s) => s.artistIds[0] === "a" || s.id === "b0");
  assert.deepEqual([...selectEntrants(options, available).counts.values()], [7, 1]);
  const shared = { ...songs[0], id: "shared", artistIds: ["a", "b"], albumIds: options.albumIds };
  const field = selectEntrants({ ...options, size: 0 }, [...songs, shared]).entrants;
  assert.equal(field.length, 25);
  assert.equal(field.filter((s) => s.id === "shared").length, 1);
  assert.doesNotThrow(() => validateDefinition(definition()));
});

test("share links preserve the full tree, frozen videos and timestamps across origins", async () => {
  const snapshot = challengeSnapshot(definition(), { a0: { primary: "abcdefghijk", start: 30 } });
  const link = await createChallengeLink(snapshot, "https://example.com/music/?x=1");
  const replay = await readChallengeLink(new URL(link).hash);
  assert.deepEqual(replay, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(replay.songs.find((s) => s.id === "a0")?.youtubeId, "abcdefghijk");
  assert.equal(replay.sharedSources?.a0.start, 30);
  assert.ok(!("picks" in replay));
  await assert.rejects(readChallengeLink("#bracket=v1.invalid"));
  await assert.rejects(readChallengeLink("#bracket=v2.abc"));
  assert.throws(() => validateDefinition({ ...snapshot, artists: {} } as never));
});
