import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDefinition,
  choose,
  currentMatch,
  matchSongs,
  selectEntrants,
  validateDefinition,
} from "../src/engine.ts";
import {
  challengeSnapshot,
  createChallengeLink,
  createPortableChallengeLink,
  readChallengeLink,
  createResultLink,
  readResultLink,
} from "../src/share.ts";
import {
  createBracket,
  loadBracket,
  type ShareEnvironment,
} from "../server/brackets.ts";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { BracketOptions, Run, Song } from "../src/types.ts";

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
    id: artist + index,
    title: artist + index,
    artistIds: [artist],
    albumId: "album-" + artist,
    albumIds: ["album-" + artist],
    kind: "song",
    quality: artist === "a" ? 100 : 40,
    popularity: 100 - index,
    scoreSource: "fixture",
  })),
);
const definition = () =>
  makeDefinition(
    options,
    songs,
    [
      {
        id: "album-a",
        title: "A",
        year: 2020,
        artistIds: ["a"],
        cover: "/record.svg",
      },
      {
        id: "album-b",
        title: "B",
        year: 2020,
        artistIds: ["b"],
        cover: "/record.svg",
      },
    ],
    { id: "mixed", name: "A & B" },
    [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  );

test("mixed fields balance artists, redistribute spare slots and deduplicate collaborations", () => {
  assert.deepEqual([...selectEntrants(options, songs).counts.values()], [4, 4]);
  const available = songs.filter(
    (s) => s.artistIds[0] === "a" || s.id === "b0",
  );
  assert.deepEqual(
    [...selectEntrants(options, available).counts.values()],
    [7, 1],
  );
  const shared = {
    ...songs[0],
    id: "shared",
    artistIds: ["a", "b"],
    albumIds: options.albumIds,
  };
  const field = selectEntrants({ ...options, size: 0 }, [
    ...songs,
    shared,
  ]).entrants;
  assert.equal(field.length, 25);
  assert.equal(field.filter((s) => s.id === "shared").length, 1);
  assert.doesNotThrow(() => validateDefinition(definition()));
});

test("share links preserve the full tree, frozen videos and timestamps across origins", async () => {
  const snapshot = challengeSnapshot(definition(), {
    a0: { primary: "abcdefghijk", start: 30 },
  });
  const link = await createPortableChallengeLink(
    snapshot,
    "https://example.com/music/?x=1",
  );
  const replay = await readChallengeLink(new URL(link).hash);
  assert.deepEqual(replay, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(
    replay.songs.find((s) => s.id === "a0")?.youtubeId,
    "abcdefghijk",
  );
  assert.equal(replay.sharedSources?.a0.start, 30);
  assert.ok(!("picks" in replay));
  await assert.rejects(readChallengeLink("#bracket=v1.invalid"));
  await assert.rejects(readChallengeLink("#bracket=v2.abc"));
  assert.throws(() =>
    validateDefinition({ ...snapshot, artists: {} } as never),
  );
});

test("short links store an immutable replay, deduplicate shares and reject malformed writes", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0002_shared_brackets.sql", import.meta.url),
      "utf8",
    ),
  );
  const env: ShareEnvironment = {
    BRACKETS: {
      prepare(sql) {
        let values: (string | number)[] = [];
        return {
          bind(...args) {
            values = args;
            return this;
          },
          async first<T>() {
            return (db.prepare(sql).get(...values) as T) ?? null;
          },
          async run() {
            const result = db.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
    },
  };
  const snapshot = challengeSnapshot(definition(), {
    a0: { primary: "abcdefghijk", start: 30 },
  });
  const originalFetch = globalThis.fetch;
  // Exercise the same client requests and SQL handlers used by Pages Functions.
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://musicbracket.pages.dev");
    const request = new Request(url, {
      ...init,
      headers: { ...init?.headers, Origin: url.origin },
    });
    return request.method === "POST"
      ? createBracket(request, env)
      : loadBracket(request, env, url.pathname.split("/").at(-1)!);
  };
  try {
    const link = await createChallengeLink(
      snapshot,
      "https://musicbracket.pages.dev/?old=1#previous",
    );
    assert.match(link, /^https:\/\/musicbracket\.pages\.dev\/#b=[\w-]{16}$/);
    assert.ok(link.length < 60);
    assert.deepEqual(
      await readChallengeLink(new URL(link).hash),
      JSON.parse(JSON.stringify(snapshot)),
    );
    assert.equal(
      await createChallengeLink(snapshot, "https://musicbracket.pages.dev/"),
      link,
    );
    assert.equal(
      (
        db.prepare("SELECT COUNT(*) AS total FROM shared_brackets").get() as {
          total: number;
        }
      ).total,
      1,
    );
    const portable = await createChallengeLink(
      snapshot,
      "http://musicbracket.localhost:19473/",
    );
    assert.ok(portable.includes("#bracket=v1."));
    assert.deepEqual(
      await readChallengeLink(new URL(portable).hash),
      JSON.parse(JSON.stringify(snapshot)),
    );
    await assert.rejects(readChallengeLink("#b=short"));
    let run: Run = {
      id: snapshot.id,
      definition: snapshot,
      picks: [],
      updatedAt: snapshot.createdAt,
    };
    await assert.rejects(
      createResultLink(run, "full", "https://musicbracket.pages.dev/"),
    );
    for (let match = currentMatch(run); match; match = currentMatch(run)) {
      run = choose(run, matchSongs(run, match)[0].id);
    }
    const full = await createResultLink(
      run,
      "full",
      "https://musicbracket.pages.dev/",
    );
    const top = await createResultLink(
      run,
      "top",
      "https://musicbracket.pages.dev/",
    );
    assert.match(new URL(full).hash, /^#r=[\w-]{16}$/);
    assert.equal(top, full + "/16");
    const result = await readResultLink(new URL(full).hash);
    assert.deepEqual(
      result.run.picks.map(({ matchId, songId }) => ({ matchId, songId })),
      run.picks.map(({ matchId, songId }) => ({ matchId, songId })),
    );
    assert.equal((await readResultLink(new URL(top).hash)).mode, "top");
    assert.equal(
      (
        await readResultLink(
          new URL(
            await createResultLink(
              run,
              "full",
              "http://musicbracket.localhost:19473/",
            ),
          ).hash,
        )
      ).run.picks.length,
      run.picks.length,
    );
    await assert.rejects(
      readChallengeLink(new URL(full).hash.replace("#r=", "#b=")),
    );
    const invalid = await createBracket(
      new Request("https://musicbracket.pages.dev/api/brackets", {
        method: "POST",
        headers: { Origin: "https://other.example" },
      }),
      env,
    );
    assert.equal(invalid.status, 403);
    const missing = await loadBracket(
      new Request(
        "https://musicbracket.pages.dev/api/brackets/abcdefghijklmnop",
      ),
      env,
      "abcdefghijklmnop",
    );
    assert.equal(missing.status, 404);
    const oversized = await createBracket(
      new Request("https://musicbracket.pages.dev/api/brackets", {
        method: "POST",
        headers: {
          Origin: "https://musicbracket.pages.dev",
          "Content-Type": "application/json",
        },
        body: "x".repeat(91_000),
      }),
      env,
    );
    assert.equal(oversized.status, 413);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
