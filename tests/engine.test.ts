import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choose,
  currentMatch,
  decisionCount,
  makeDefinition,
  matchSongs,
  outcomes,
  plan,
  undo,
  validateDefinition,
} from "../src/engine.ts";
import { VoteWindow } from "../src/chat.ts";
import type { BracketOptions, Run, Song } from "../src/types.ts";
const options: BracketOptions = {
  artistId: "test",
  albumIds: ["a", "b", "c"],
  includeInterludes: false,
  size: 0,
  first: 2,
  second: 2,
  randomness: 28,
  seed: 1234,
  name: "",
};
const songs = (n: number): Song[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    title: `Song ${i}`,
    albumId: ["a", "b", "c"][i % 3],
    albumIds: [["a", "b", "c"][i % 3]],
    artistIds: ["test"],
    kind: "song",
    quality: 100 - i * 0.1,
    popularity: 80 - i * 0.1,
    scoreSource: "Test fixture",
  }));
const definition = (n: number, o: Partial<BracketOptions> = {}) =>
  makeDefinition(
    { ...options, ...o },
    songs(n),
    ["a", "b", "c"].map((id) => ({
      id,
      title: id,
      year: 2020,
      artistIds: ["test"],
      cover: "",
    })),
    { id: "test", name: "Test" },
  );
test("every field size 2–512 and all early-round caps balance without losing entrants", () => {
  for (let n = 2; n <= 512; n++)
    for (const first of [2, 3, 4])
      for (const second of [2, 3, 4]) {
        const rounds = plan(n, first, second);
        let current = n;
        rounds.forEach((sizes, i) => {
          assert.equal(
            sizes.reduce((a, b) => a + b, 0),
            current,
          );
          assert.ok(
            sizes.every(
              (s) => s >= 1 && s <= (i === 0 ? first : i === 1 ? second : 2),
            ),
          );
          assert.ok(sizes.length < current);
          current = sizes.length;
        });
        assert.equal(current, 1);
      }
});
test("all 100 songs progress through a four-way opening and second round", () => {
  const d = definition(100, { first: 4, second: 4 });
  assert.deepEqual(d.roundSizes, [100, 32, 8, 4, 2, 1]);
  assert.equal(decisionCount(d), 47);
  let r: Run = { id: "run", definition: d, picks: [], updatedAt: "" };
  const played = new Set<string>();
  while (currentMatch(r)) {
    const m = currentMatch(r)!;
    if (m.round === 0)
      matchSongs(r, m).forEach((s) => {
        assert.ok(!played.has(s.id));
        played.add(s.id);
      });
    r = choose(r, matchSongs(r, m)[0].id);
  }
  assert.equal(played.size, 100);
  assert.equal(r.picks.length, 47);
  assert.ok(outcomes(r)[d.matches.at(-1)!.id]);
});
test("classic byes advance automatically and only one champion remains", () => {
  for (const n of [3, 5, 17, 40, 101]) {
    const d = definition(n);
    let r: Run = { id: "x", definition: d, picks: [], updatedAt: "" };
    while (currentMatch(r))
      r = choose(r, matchSongs(r, currentMatch(r)!)[0].id);
    assert.equal(r.picks.length, n - 1);
    assert.ok(outcomes(r)[d.matches.at(-1)!.id]);
  }
});
test("seeded shuffle is reproducible and protects top songs in opposite branches", () => {
  const a = definition(64, { randomness: 0 }),
    b = definition(64, { randomness: 0 });
  assert.deepEqual(a.matches, b.matches);
  const first = a.matches.filter((m) => m.round === 0);
  const topA = first.findIndex((m) =>
    m.slots.some((s) => "songId" in s && s.songId === "s0"),
  );
  const topB = first.findIndex((m) =>
    m.slots.some((s) => "songId" in s && s.songId === "s1"),
  );
  assert.ok(topA < 16 !== topB < 16);
  assert.notDeepEqual(
    definition(64, { seed: 9, randomness: 100 }).matches,
    definition(64, { seed: 22, randomness: 100 }).matches,
  );
});
test("undo reverses final result and permits a different winner", () => {
  const d = definition(8);
  let r: Run = { id: "x", definition: d, picks: [], updatedAt: "" };
  while (currentMatch(r)) r = choose(r, matchSongs(r, currentMatch(r)!)[0].id);
  const old = outcomes(r)[d.matches.at(-1)!.id];
  r = undo(r);
  assert.ok(currentMatch(r));
  r = choose(r, matchSongs(r, currentMatch(r)!)[1].id);
  assert.notEqual(outcomes(r)[d.matches.at(-1)!.id], old);
});
test("selection uses combined score; skits excluded; shared album tracks deduplicated by catalog identity", () => {
  const all = songs(20);
  all[0].kind = "skit";
  all[1].albumIds = ["a", "b"];
  const d = makeDefinition({ ...options, size: 8 }, all, [], {
    id: "test",
    name: "Test",
  });
  assert.equal(d.songs.length, 8);
  assert.ok(!d.songs.some((s) => s.id === "s0"));
  assert.equal(d.songs.filter((s) => s.id === "s1").length, 1);
});
test("a playback checkpoint belongs to a saved pick and is removed by undo", () => {
  const run: Run = {
    id: "playback",
    definition: definition(4),
    picks: [],
    updatedAt: "",
  };
  const match = currentMatch(run)!;
  const [first, second] = matchSongs(run, match);
  const position = { videoId: "hTWKbfoikeg", seconds: 48.25 };
  const saved: Run = JSON.parse(
    JSON.stringify(choose(run, first.id, position)),
  );
  assert.deepEqual(saved.picks[0].position, position);
  const corrected = choose(undo(saved), second.id);
  assert.deepEqual(
    corrected.picks.map((pick) => [pick.songId, pick.position]),
    [[second.id, undefined]],
  );
});
test("invalid votes and forward references are rejected", () => {
  const d = definition(8),
    r: Run = { id: "x", definition: d, picks: [], updatedAt: "" };
  assert.throws(() => choose(r, "missing"));
  const broken = structuredClone(d);
  broken.matches[0].slots = [{ matchId: "r1-m0" }];
  assert.throws(() => validateDefinition(broken));
  assert.equal(validateDefinition(d), d);
});
test("dormant chat vote window rejects stale votes, deduplicates voters, permits vote changes", () => {
  const w = new VoteWindow("m", ["a", "b"], 100, 200);
  assert.equal(
    w.accept({ matchId: "m", songId: "a", voterId: "u", receivedAt: 99 }),
    false,
  );
  assert.equal(
    w.accept({ matchId: "m", songId: "a", voterId: "u", receivedAt: 110 }),
    true,
  );
  w.accept({ matchId: "m", songId: "b", voterId: "u", receivedAt: 120 });
  assert.deepEqual(w.tally(), { a: 0, b: 1 });
  assert.equal(
    w.accept({ matchId: "other", songId: "a", voterId: "v", receivedAt: 130 }),
    false,
  );
});
