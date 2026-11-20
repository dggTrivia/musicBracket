import type {
  Album,
  Artist,
  BracketOptions,
  Definition,
  Match,
  Run,
  Song,
} from "./types";
export function random(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const defaultPopularityWeight = 60;
export const selectionScore = (
  s: Song,
  popularityWeight = defaultPopularityWeight,
) =>
  s.popularity * (popularityWeight / 100) +
  s.quality * ((100 - popularityWeight) / 100);
export const seedingScore = selectionScore;
export function groupSizes(n: number, cap: number): number[] {
  if (n < 2) return [];
  // Choose a power-of-two survivor count within the cap, allowing byes if needed.
  let survivors = 2 ** Math.ceil(Math.log2(Math.ceil(n / cap)));
  if (cap > 2) {
    const candidates = [];
    for (let k = 1; k <= n / 2; k *= 2)
      if (n >= 2 * k && n <= cap * k) candidates.push(k);
    if (candidates.length) survivors = Math.min(...candidates);
  }
  const sizes = Array(survivors).fill(Math.floor(n / survivors));
  for (let i = 0; i < n % survivors; i++) sizes[i]++;
  // A classic preliminary round uses byes rather than groups larger than two.
  if (cap === 2) {
    const target = 2 ** Math.floor(Math.log2(n));
    if (target === n) return Array(n / 2).fill(2);
    return [...Array(n - target).fill(2), ...Array(2 * target - n).fill(1)];
  }
  return sizes;
}
export function plan(n: number, first: number, second: number) {
  const rounds: number[][] = [];
  let round = 0;
  while (n > 1) {
    const sizes = groupSizes(n, round === 0 ? first : round === 1 ? second : 2);
    rounds.push(sizes);
    n = sizes.length;
    round++;
  }
  return rounds;
}
function seedOrder(n: number): number[] {
  if (n === 1) return [1];
  const prev = seedOrder(n / 2);
  return prev.flatMap((x) => [x, n + 1 - x]);
}

export function selectEntrants(options: BracketOptions, songs: Song[]) {
  const score = (song: Song) => selectionScore(song, options.popularityWeight);
  const albumSets = Object.entries(
    options.artistAlbums ?? { [options.artistId]: options.albumIds },
  ).map(([artistId, albums]) => ({ artistId, albums: new Set(albums) }));
  const ranked = songs
    .filter((song) => options.includeInterludes || song.kind === "song")
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const pools = albumSets.map(({ artistId, albums }) => ({
    artistId,
    songs: ranked.filter(
      (song) =>
        song.artistIds.includes(artistId) &&
        song.albumIds.some((id) => albums.has(id)),
    ),
    used: 0,
    cursor: 0,
  }));
  const entrants: Song[] = [];
  const owners = new Map<string, string>();
  const limit = options.size || ranked.length;
  while (entrants.length < limit) {
    for (const pool of pools) {
      while (owners.has(pool.songs[pool.cursor]?.id)) pool.cursor++;
    }
    const next = pools
      .filter((pool) => pool.cursor < pool.songs.length)
      .sort(
        (a, b) =>
          a.used - b.used ||
          a.songs.length - a.cursor - (b.songs.length - b.cursor) ||
          score(b.songs[b.cursor]) - score(a.songs[a.cursor]),
      )[0];
    if (!next) break;
    const song = next.songs[next.cursor++];
    next.used++;
    owners.set(song.id, next.artistId);
    entrants.push(song);
  }
  return {
    entrants,
    owners,
    counts: new Map(pools.map((p) => [p.artistId, p.used])),
  };
}

export function songArtist(definition: Definition, song: Song) {
  return (
    definition.artists
      ?.filter((artist) => song.artistIds.includes(artist.id))
      .map((artist) => artist.name)
      .join(" & ") || definition.artist.name
  );
}

export function makeDefinition(
  options: BracketOptions,
  allSongs: Song[],
  albums: Album[],
  artist: Artist,
  artists?: Artist[],
): Definition {
  const rng = random(options.seed);
  const score = (song: Song) => seedingScore(song, options.popularityWeight);
  const { entrants, owners } = selectEntrants(options, allSongs);
  if (entrants.length < 2)
    throw Error("Select at least two songs to start a bracket.");
  const sorted = entrants
    .map((s) => ({
      s,
      score: score(s) + (rng() - 0.5) * options.randomness * 0.34,
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  const rounds = plan(sorted.length, options.first, options.second);
  const groups: Song[][] = rounds[0].map(() => []);
  // Balanced bracket ordering protects seeds across later branches, not just in round one.
  const order = seedOrder(groups.length).map((x) => x - 1);
  const capacities = rounds[0];
  const distribution: Song[] = [];
  for (let start = 0; start < sorted.length; start += groups.length) {
    const band = sorted.slice(start, start + groups.length);
    if (Math.floor(start / groups.length) % 2 === 1) band.reverse();
    distribution.push(...band);
  }
  distribution.forEach((song) => {
    const eligible = order.filter((i) => groups[i].length < capacities[i]);
    const min = Math.min(...eligible.map((i) => groups[i].length));
    let bucket = eligible.filter((i) => groups[i].length === min);
    if (min === 0) {
      const chosen = order.find((i) => bucket.includes(i))!;
      groups[chosen].push(song);
      return;
    }
    // Weak seeds fill the opposite edge of each quality band; album ties get a small penalty.
    bucket = bucket.sort((a, b) => {
      const groupScore = (group: Song[]) =>
        group.reduce((s, x) => s + score(x), 0) / group.length -
        (group.some((x) => x.albumId === song.albumId) ? 1.5 : 0) -
        (artists && group.some((x) => owners.get(x.id) === owners.get(song.id))
          ? 5
          : 0);
      return groupScore(groups[b]) - groupScore(groups[a]);
    });
    const choice =
      options.randomness > 70 && bucket.length > 1 && rng() < 0.15
        ? bucket[1]
        : bucket[0];
    groups[choice].push(song);
  });
  const matches: Match[] = [];
  let previous: string[] = [];
  rounds.forEach((sizes, r) => {
    let offset = 0;
    const ids: string[] = [];
    sizes.forEach((count, i) => {
      const id = `r${r}-m${i}`;
      matches.push({
        id,
        round: r,
        slots:
          r === 0
            ? groups[i].map((s) => ({ songId: s.id }))
            : previous
                .slice(offset, offset + count)
                .map((matchId) => ({ matchId })),
      });
      offset += count;
      ids.push(id);
    });
    previous = ids;
  });
  return {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    options,
    songs: entrants,
    albums: albums.filter((a) =>
      entrants.some((s) => s.albumIds.includes(a.id)),
    ),
    artist,
    ...(artists ? { artists } : {}),
    matches,
    roundSizes: [entrants.length, ...rounds.map((s) => s.length)],
  };
}
export function outcomes(run: Run) {
  const won: Record<string, string> = Object.create(null);
  const picks = new Map(run.picks.map((p) => [p.matchId, p.songId]));
  for (const m of run.definition.matches) {
    const candidates = m.slots.map((x) =>
      "songId" in x ? x.songId : won[x.matchId],
    );
    if (candidates.every(Boolean)) {
      if (candidates.length === 1) won[m.id] = candidates[0];
      else if (picks.has(m.id) && candidates.includes(picks.get(m.id)!))
        won[m.id] = picks.get(m.id)!;
    }
  }
  return won;
}
export function currentMatch(run: Run) {
  const won = outcomes(run);
  return run.definition.matches.find(
    (m) =>
      !won[m.id] &&
      m.slots.every((x) => "songId" in x || Boolean(won[x.matchId])),
  );
}
export function matchSongs(run: Run, m: Match) {
  const won = outcomes(run);
  return m.slots
    .map((x) =>
      run.definition.songs.find(
        (s) => s.id === ("songId" in x ? x.songId : won[x.matchId]),
      ),
    )
    .filter((x): x is Song => Boolean(x));
}
export function choose(
  run: Run,
  songId: string,
  position?: Run["picks"][number]["position"],
): Run {
  const m = currentMatch(run);
  if (!m || !matchSongs(run, m).some((s) => s.id === songId))
    throw Error("This song is not in the current matchup.");
  return {
    ...run,
    picks: [
      ...run.picks,
      {
        matchId: m.id,
        songId,
        at: new Date().toISOString(),
        ...(position ? { position } : {}),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
export function undo(run: Run): Run {
  return {
    ...run,
    picks: run.picks.slice(0, -1),
    updatedAt: new Date().toISOString(),
  };
}
export function decisionCount(d: Definition) {
  return d.matches.filter((m) => m.slots.length > 1).length;
}
export function validateDefinition(d: Definition) {
  if (
    !d ||
    d.version !== 1 ||
    !d.artist ||
    !Array.isArray(d.songs) ||
    d.songs.length < 2 ||
    d.songs.length > 5000 ||
    !Array.isArray(d.matches) ||
    d.matches.length > 10000 ||
    !d.options ||
    !Array.isArray(d.albums) ||
    !Array.isArray(d.roundSizes) ||
    typeof d.artist.name !== "string" ||
    !d.matches.length
  )
    throw Error("Invalid bracket file.");
  const songs = new Set(d.songs.map((s) => s.id));
  if (
    (d.artists !== undefined &&
      (!Array.isArray(d.artists) ||
        d.artists.length > 26 ||
        d.artists.some(
          (artist) =>
            !artist ||
            typeof artist.id !== "string" ||
            typeof artist.name !== "string",
        ))) ||
    typeof d.options.name !== "string" ||
    (d.options.popularityWeight !== undefined &&
      (!Number.isInteger(d.options.popularityWeight) ||
        d.options.popularityWeight < 0 ||
        d.options.popularityWeight > 100)) ||
    d.albums.some(
      (album) =>
        !album ||
        typeof album.id !== "string" ||
        typeof album.title !== "string" ||
        typeof album.cover !== "string" ||
        !Array.isArray(album.artistIds),
    ) ||
    (d.sharedSources !== undefined &&
      (!d.sharedSources ||
        typeof d.sharedSources !== "object" ||
        Array.isArray(d.sharedSources) ||
        Object.values(d.sharedSources).some(
          (source) =>
            !source ||
            (source.start !== undefined &&
              (!Number.isFinite(source.start) || source.start < 0)) ||
            (source.primary !== undefined &&
              !/^[\w-]{11}$/.test(source.primary)) ||
            (source.backup !== undefined && !/^[\w-]{11}$/.test(source.backup)),
        )))
  )
    throw Error("Invalid bracket details.");
  if (
    songs.size !== d.songs.length ||
    d.songs.some(
      (s) =>
        typeof s.id !== "string" ||
        typeof s.title !== "string" ||
        !Array.isArray(s.albumIds) ||
        !Array.isArray(s.artistIds) ||
        !Number.isFinite(s.quality) ||
        !Number.isFinite(s.popularity),
    )
  )
    throw Error("Invalid song data.");
  const known = new Set<string>();
  const consumed = new Set<string>();
  const entrants = new Set<string>();
  const byId = new Map<string, Match>();
  for (const m of d.matches) {
    if (
      typeof m.id !== "string" ||
      !Number.isInteger(m.round) ||
      m.round < 0 ||
      known.has(m.id) ||
      !Array.isArray(m.slots) ||
      m.slots.length < 1 ||
      m.slots.length > 4
    )
      throw Error("Invalid matchup.");
    for (const x of m.slots) {
      if (
        !x ||
        ("songId" in x
          ? !songs.has(x.songId) || entrants.has(x.songId) || m.round !== 0
          : !known.has(x.matchId) ||
            consumed.has(x.matchId) ||
            byId.get(x.matchId)?.round !== m.round - 1)
      )
        throw Error("Invalid bracket progression.");
      if ("songId" in x) entrants.add(x.songId);
      else consumed.add(x.matchId);
    }
    known.add(m.id);
    byId.set(m.id, m);
  }
  if (entrants.size !== songs.size || consumed.size !== d.matches.length - 1)
    throw Error("The file does not contain one complete tournament tree.");
  return d;
}
