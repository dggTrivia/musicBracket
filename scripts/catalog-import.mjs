/** Reproducible curated studio-album catalog importer. Public Apple metadata only.
 * Run: node scripts/catalog-import.mjs; resumable cache in tmp/itunes.
 * Completeness is checked against explicit album families, not search ranking.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyRatings, normalizeTitle } from "./ratings-import.mjs";
import {
  expandedAlbums,
  expandedBonusTracks,
  expandedPhysicalAlbums,
} from "./expanded-albums.mjs";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, "tmp/itunes");
await mkdir(cache, { recursive: true });
await mkdir(path.join(root, "public/covers"), { recursive: true });
const artists = [
  { id: "kanye-west", name: "Kanye West", appleId: 2715720 },
  { id: "kid-cudi", name: "Kid Cudi", appleId: 273058501 },
  { id: "frank-ocean", name: "Frank Ocean", appleId: 442122051 },
  { id: "kendrick-lamar", name: "Kendrick Lamar", appleId: 368183298 },
  { id: "the-beatles", name: "The Beatles", appleId: 136975 },
  { id: "queen", name: "Queen", appleId: 3296287 },
  { id: "michael-jackson", name: "Michael Jackson", appleId: 32940 },
  { id: "abba", name: "ABBA", appleId: 372976 },
  { id: "rihanna", name: "Rihanna", appleId: 63346553 },
];
// Apple editions are curated here. Videos and duplicate alternative recordings are removed.
const plans = {
  "kanye-west": [
    [1412872568, "The College Dropout", 2004],
    [1440668749, "Late Registration", 2005],
    [1451901307, "Graduation", 2007],
    [1609149054, "808s & Heartbreak", 2008],
    [1445865909, "My Beautiful Dark Twisted Fantasy", 2010],
    [1440845249, "Watch the Throne", 2011],
    [1443478391, "Cruel Summer", 2012],
    [1440873068, "Yeezus", 2013],
    [1443063578, "The Life of Pablo", 2016],
    [1441456689, "ye", 2018],
    [1396710872, "Kids See Ghosts", 2018],
    [1484936940, "Jesus Is King", 2019],
    [1595496182, "Donda", 2021],
    [1818888557, "Donda 2", 2022],
    [1760997037, "Vultures 1", 2024],
    [1762101173, "Vultures 2", 2024],
    [6782267796, "Bully", 2026],
  ],
  "kid-cudi": [
    [1472484829, "Man on the Moon: The End of Day", 2009],
    [1452877009, "Man on the Moon II: The Legend of Mr. Rager", 2010],
    [1443634211, "WZRD", 2012],
    [1445882329, "Indicud", 2013],
    [1440859422, "Satellite Flight: The Journey to Mother Moon", 2014],
    [1443191955, "Speedin’ Bullet 2 Heaven", 2015],
    [1440866929, "Passion, Pain & Demon Slayin’", 2016],
    [1543635399, "Man on the Moon III: The Chosen", 2020],
    [1647008692, "Entergalactic", 2022],
    [1826864356, "Insano", 2024],
    [1732627243, "Insano (Nitro Mega)", 2024],
    [1825252381, "Free", 2025],
  ],
  "frank-ocean": [
    [1440765580, "Channel Orange", 2012],
    [1146195596, "Blonde", 2016],
  ],
  "kendrick-lamar": [
    [1171563506, "Overly Dedicated", 2010],
    [1475039105, "Section.80", 2011],
    [1440818890, "good kid, m.A.A.d city", 2012],
    [1440828886, "To Pimp a Butterfly", 2015],
    [1440844834, "untitled unmastered.", 2016],
    [1440881047, "DAMN.", 2017],
    [1440906927, "Black Panther: The Album", 2018],
    [1626195790, "Mr. Morale & the Big Steppers", 2022],
    [1781270319, "GNX", 2024],
  ],
  "the-beatles": [
    [6818180340, "Please Please Me", 1963],
    [6818180546, "With the Beatles", 1963],
    [6818176456, "A Hard Day’s Night", 1964],
    [6818180917, "Beatles for Sale", 1964],
    [6818180566, "Help!", 1965],
    [6818181444, "Rubber Soul", 1965],
    [6818124164, "Revolver", 1966],
    [1573250333, "Sgt. Pepper’s Lonely Hearts Club Band", 1967],
    [6818181502, "Magical Mystery Tour", 1967],
    [6818178636, "The Beatles (White Album)", 1968],
    [6818173263, "Yellow Submarine", 1969],
    [6818128121, "Abbey Road", 1969],
    [6818174318, "Let It Be", 1970],
  ],
  queen: [
    [6781079599, "Queen", 1973],
    [6781078975, "Queen II", 1974],
    [6781078345, "Sheer Heart Attack", 1974],
    [6781024026, "A Night at the Opera", 1975],
    [6781024048, "A Day at the Races", 1976],
    [6781080679, "News of the World", 1977],
    [6781079346, "Jazz", 1978],
    [6781076388, "The Game", 1980],
    [6781023023, "Flash Gordon", 1980],
    [6781024053, "Hot Space", 1982],
    [6781461206, "The Works", 1984],
    [6781023865, "A Kind of Magic", 1986],
    [6819840320, "The Miracle", 1989],
    [6781078872, "Innuendo", 1991],
    [6781076648, "Made in Heaven", 1995],
    [6781076317, "The Cosmos Rocks", 2008],
  ],
  "michael-jackson": [
    [1442259586, "Got to Be There", 1972],
    [1443228603, "Ben", 1972],
    [1443284801, "Music & Me", 1973],
    [1444039101, "Forever, Michael", 1975],
    [186166282, "Off the Wall", 1979],
    [1641780996, "Thriller", 1982],
    [551515699, "Bad", 1987],
    [322847038, "Dangerous", 1991],
    [310505551, "HIStory: Past, Present and Future, Book I", 1995],
    [193015198, "Blood on the Dance Floor: HIStory in the Mix", 1997],
    [215738269, "Invincible", 2001],
    [1631592477, "Michael", 2010],
    [850697616, "Xscape", 2014],
  ],
  abba: [
    [1440859254, "Ring Ring", 1973],
    [1440861218, "Waterloo", 1974],
    [1440861160, "ABBA", 1975],
    [1440820126, "Arrival", 1976],
    [1440821028, "The Album", 1977],
    [1440816296, "Voulez-Vous", 1979],
    [1440823811, "Super Trouper", 1980],
    [1440715246, "The Visitors", 1981],
    [1583785050, "Voyage", 2021],
    [1445870793, "Gracias por la Música", 1980],
  ],
  rihanna: [
    [1440867092, "Music of the Sun", 2005],
    [1440866306, "A Girl Like Me", 2006],
    [1441154435, "Good Girl Gone Bad", 2007],
    [1440775689, "Rated R", 2009],
    [1440808164, "Loud", 2010],
    [1443105016, "Talk That Talk", 2011],
    [1417177082, "Unapologetic", 2012],
    [1440933869, "Anti", 2016],
  ],
};
// Keep non-album tracks in one selectable group per artist. The first release
// provides the group's cover. Favor major lead-artist singles missing from the
// album catalog.
const singles = {
  "the-beatles": [
    1963,
    [1441133181],
    [
      "Hey Jude",
      "I Want to Hold Your Hand",
      "Don't Let Me Down",
      "Day Tripper",
      "She Loves You",
    ],
  ],
  "frank-ocean": [
    2017,
    [1214557444, 1486713879, 1445278500, 1349524897, 1444860879],
    ["Chanel", "In My Room", "Novacane", "Moon River", "Swim Good"],
  ],
  "kendrick-lamar": [
    2024,
    [1744776162, 1744024729, 1744776349],
    ["Not Like Us", "euphoria", "meet the grahams"],
  ],
  rihanna: [
    2015,
    [1445170915, 1445136072, 1651763191, 985919136],
    [
      "FourFiveSeconds",
      "Bitch Better Have My Money",
      "Lift Me Up",
      "American Oxygen",
    ],
  ],
};
const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
async function get(url, file) {
  try {
    return JSON.parse(await readFile(path.join(cache, file), "utf8"));
  } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  const json = await response.json();
  await writeFile(path.join(cache, file), JSON.stringify(json));
  return json;
}
let catalog = {
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  artists: artists.map(({ id, name }) => ({ id, name })),
  albums: [],
  songs: [],
  sources: [],
  issues: [],
};
const singlesOnly = process.argv.includes("--singles-only");
const append = singlesOnly || process.argv.includes("--expanded-only");
const artistFilter = new Set(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--artist="))
    .map((arg) => arg.slice(9)),
);
const expandedArtists = Object.entries(expandedAlbums).map(
  ([id, [name, albums]]) => {
    plans[id] = albums;
    return { id, name };
  },
);
if (append)
  catalog = JSON.parse(
    await readFile(path.join(root, "public/catalog.json"), "utf8"),
  );
for (const { id, name } of expandedArtists) {
  if (!catalog.artists.some((artist) => artist.id === id))
    catalog.artists.push({ id, name });
}
const songKey = (artistIds, title) =>
  `${artistIds.includes("kanye-west") && artistIds.includes("kid-cudi") ? "kids-see-ghosts" : artistIds[0]}:${normalizeTitle(title)}`;
const songMap = new Map(
  catalog.songs.map((song) => [songKey(song.artistIds, song.title), song]),
);
const skits = new Set([
  "intro",
  "we dont care intro",
  "graduation day",
  "lil jimmy skit",
  "school spirit skit 1",
  "school spirit skit 2",
  "school spirit skit 3",
  "skit 1",
  "skit 2",
  "skit 3",
  "skit 4",
  "illest motherfucker alive intro",
  "be yourself",
  "facebook story",
  "fitter happier",
  "donda chant",
  "silver surfer intermission",
  "low lights",
  "not just money",
  "end",
  "start",
  "bitch im in the club intro",
]);
const linkinParkInterludes = new Set([
  "foreword",
  "the requiem",
  "the radiance",
  "empty spaces",
  "jornada del muerto",
  "wisdom, justice, and love",
  "fallout",
  "from zero (intro)",
]);
function kind(title, artistId) {
  if (
    /skit/i.test(title) ||
    skits.has(title.toLowerCase()) ||
    [
      "Wake Up Mr. West",
      "Workout Plan",
      "I Love Kanye",
      "Who Will Survive In America",
      "We Aite (Wake Your Mind Up)",
      "Beautiful Trip",
      "A Certain Way",
      "Honeybaby",
    ].includes(title)
  )
    return "skit";
  if (
    /interlude|intermission/i.test(title) ||
    (artistId === "linkin-park" &&
      linkinParkInterludes.has(title.toLowerCase())) ||
    ["Chapter Six", "Chapter Ten", "Frank’s Track", "Frank's Track"].includes(
      title,
    )
  )
    return "interlude";
  return "song";
}
function canonicalTitle(title) {
  return title
    .replace(/\s*[([](?:feat\.?|featuring|with)\b[^)\]]*[)\]]/gi, "")
    .replace(
      /\s*[([][^)\]]*(?:remaster|remix|\bmix\b|album version|original version|original demo|demo version|extended version|acoustic demo|rehearsal demo|mono|stereo|single version|radio edit|bonus track|remixed)[^)\]]*[)\]]/gi,
      "",
    )
    .replace(
      /\s*[-–—]\s*(?:\d{4}\s*)?(?:remaster|remix|album version|original version|original demo|demo version|extended version|acoustic demo|rehearsal demo|mono|stereo|single version|radio edit|bonus track|remixed).*$/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
function addSong(track, album, artistIds) {
  let title = canonicalTitle(track.trackName || track.title);
  if (!title) return;
  if (album.title === "Donda") title = title.replace(/\s+pt\.?\s*2$/i, "");
  if (artistIds.includes("michael-jackson"))
    title = title.replace(/\s*\(2008 with Akon\)$/i, "").replace(/\s+7"$/, "");
  if (artistIds.includes("queen"))
    title = title.replace(
      /\s*\((?:Demo|Edit|B-Side|\d{4} Rocks Retake|\d{4} B-Side Version)\)$/i,
      "",
    );
  if (artistIds.includes("abba"))
    title = title.replace(/\s*\(English Version\)$/i, "");
  if (artistIds.includes("kanye-west"))
    title = title
      .replace(/^Skit #(\d) \(Kanye West\/Late Registration\)$/i, "Skit #$1")
      .replace(/^Illest M\*+r Alive$/i, "Illest Motherfucker Alive");
  if (artistIds.includes("kendrick-lamar"))
    title = title.replace(/^F\*\*k Your Ethnicity$/i, "Fuck Your Ethnicity");
  if (artistIds.includes("nirvana"))
    title = title
      .replace(/\s+\(BBC (?:Mark Goodier|John Peel) Session(?: \d+)?\)$/i, "")
      .replace(/^\(New Wave\) Polly$/i, "Polly")
      .replace(/\s+\(B-Side\)$/i, "");
  if (album.title === "Band of Gypsys")
    title = title.replace(/\s+[([]Live[^)\]]*[)\]]$/i, "");
  const key = songKey(artistIds, title);
  const existing = songMap.get(key);
  if (existing) {
    if (!existing.albumIds.includes(album.id)) existing.albumIds.push(album.id);
    return;
  }
  const duration = track.trackTimeMillis
    ? Math.round(track.trackTimeMillis / 1000)
    : track.duration;
  const trackKind = kind(title, artistIds[0]);
  const quality = trackKind === "song" ? 70 : 45;
  const song = {
    id: `${key.split(":")[0]}-${slug(title)}`,
    title,
    artistIds,
    albumIds: [album.id],
    albumId: album.id,
    duration,
    kind: trackKind,
    quality,
    popularity: 50,
    scoreSource: "Quality: initial estimate · Popularity: initial estimate",
    qualitySource: {
      provider: "Initial estimate",
      note: "Neutral 70/100 prior until a verified song rating is available.",
    },
    appleTrackId: track.trackId,
    sourceUrl: track.trackViewUrl || album.sourceUrl,
  };
  songMap.set(key, song);
  catalog.songs.push(song);
}
async function checkpoint(songFilter) {
  let out = catalog;
  try {
    const ratings = JSON.parse(
      await readFile(path.join(root, "public/ratings.json"), "utf8"),
    );
    if (songFilter) {
      const scored = applyRatings(
        { ...catalog, songs: catalog.songs.filter(songFilter) },
        ratings,
      ).catalog;
      const byId = new Map(scored.songs.map((song) => [song.id, song]));
      out = {
        ...catalog,
        songs: catalog.songs.map((song) => byId.get(song.id) ?? song),
        ratingsUpdatedAt: scored.ratingsUpdatedAt,
      };
    } else {
      out = applyRatings(catalog, ratings).catalog;
    }
  } catch {}
  await writeFile(
    path.join(root, "public/catalog.json"),
    JSON.stringify(out, null, 2),
  );
}
for (const artist of singlesOnly
  ? []
  : append
    ? expandedArtists
    : [...artists, ...expandedArtists]) {
  if (append && artistFilter.size && !artistFilter.has(artist.id)) continue;
  for (const [appleId, title, year, credit] of plans[artist.id]) {
    const albumId = `${artist.id}-${slug(title)}`;
    if (catalog.albums.some((album) => album.id === albumId)) continue;
    try {
      const result = await get(
        `https://itunes.apple.com/lookup?id=${appleId}&entity=song&country=us&limit=200`,
        `album-${appleId}.json`,
      );
      const meta = result.results.find((r) => r.wrapperType === "collection");
      if (!meta) throw Error("No album metadata returned");
      if (
        !result.results.some(
          (row) => row.wrapperType === "track" && row.kind === "song",
        )
      )
        throw Error("No song rows returned");
      let artistIds = [artist.id];
      if (title === "Kids See Ghosts") artistIds = ["kanye-west", "kid-cudi"];
      if (title === "Collision Course") artistIds = ["linkin-park", "jay-z"];
      const sourceUrl = meta.collectionViewUrl;
      const coverUrl = meta.artworkUrl100?.replace(
        /100x100bb\.(jpg|png)/,
        "600x600bb.jpg",
      );
      let cover = coverUrl || "/record.svg";
      if (coverUrl) {
        try {
          const dest = path.join(root, `public/covers/${albumId}.jpg`);
          try {
            await readFile(dest);
          } catch {
            const r = await fetch(coverUrl, {
              signal: AbortSignal.timeout(20000),
            });
            if (!r.ok) throw Error("cover HTTP " + r.status);
            await writeFile(dest, Buffer.from(await r.arrayBuffer()));
          }
          cover = `/covers/${albumId}.jpg`;
        } catch (e) {
          catalog.issues.push(`${title}: cover remains remote (${e.message})`);
        }
      }
      const album = {
        id: albumId,
        artistIds,
        title,
        ...(credit || title === "Orpheus vs. the Sirens"
          ? { credit: credit ?? "Hermit and the Recluse" }
          : {}),
        year,
        cover,
        defaultSelected:
          artist.id === "kanye-west"
            ? year <= 2021
            : ![
                "Black Panther: The Album",
                "The Cosmos Rocks",
                "Gracias por la Música",
              ].includes(title),
        sourceUrl,
        appleId,
        edition: meta.collectionName,
      };
      catalog.albums.push(album);
      let tracks = result.results.filter(
        (r) => r.wrapperType === "track" && r.kind === "song",
      );
      // Bonus live takes are performances of existing songs, not unique studio entries.
      tracks = tracks.filter(
        (r) =>
          (!/[([][^)\]]*\blive\b/i.test(r.trackName) ||
            title === "Band of Gypsys" ||
            /^Pinocchio Story/i.test(r.trackName)) &&
          !/^Interview|^Commentary|^Documentary/i.test(r.trackName),
      );
      if (appleId === 1668484895)
        tracks = tracks.filter(
          (track) =>
            track.discNumber === 1 ||
            (track.discNumber === 6 &&
              !/\b(?:Lying From You|Hit The Floor|Easier To Run|Figure\.09|From The Inside) Demo\b|^Faint\b/i.test(
                track.trackName,
              )),
        );
      if (
        artist.id === "linkin-park" &&
        (title === "Hybrid Theory" || title === "Minutes to Midnight")
      )
        tracks = tracks.filter(
          (track) =>
            !/\b(?:remix|third encore session)\b/i.test(track.trackName),
        );
      // These deluxe editions include archival versions of the same songs.
      if (appleId === 171987598)
        tracks = tracks.filter((track) => track.trackNumber <= 18);
      if (appleId === 651871544)
        tracks = tracks.filter((track) => track.discNumber === 1);
      if (appleId === 1440875565)
        tracks = tracks.filter(
          (track) =>
            track.discNumber === 1 ||
            /^(?:Forgotten Tune|Jam)\b/i.test(track.trackName),
        );
      if (appleId === 1508205485 || appleId === 1508204880)
        tracks = tracks.filter(
          (track) => !/\(Take \d+\)/i.test(track.trackName),
        );
      if (appleId === 1673536063)
        tracks = tracks.filter(
          (track) =>
            !/^(?:GL \(Early Take\)|GLBTM|LYTD|The Writing of Fragments of Time|Touch \(2021 Epilogue\))/i.test(
              track.trackName,
            ),
        );
      if (appleId === 607340168 || appleId === 607337417)
        tracks = tracks.filter(
          (track) => !/\(Acoustic Version\)/i.test(track.trackName),
        );
      if (appleId === 1841975745 || appleId === 1440857300)
        tracks = tracks.filter(
          (track) => !/[([]Instrumental[)\]]/i.test(track.trackName),
        );
      // HIStory disc one is a greatest-hits compilation; membership is retained via dedup.
      for (const track of tracks) addSong(track, album, artistIds);
      catalog.sources.push({
        provider: "Apple iTunes public lookup API",
        url: `https://itunes.apple.com/lookup?id=${appleId}&entity=song&country=us&limit=200`,
        albumId,
        retrievedAt: catalog.updatedAt,
        trackCount: tracks.length,
      });
      if (!append) await checkpoint();
      console.log(`${artist.name}: ${title} (${tracks.length} source tracks)`);
    } catch (e) {
      catalog.issues.push(`${artist.name} / ${title}: ${e.message}`);
      if (!append) await checkpoint();
      console.error(catalog.issues.at(-1));
    }
  }
}
async function importSingles() {
  for (const [artistId, [year, releaseIds, titles]] of Object.entries(
    singles,
  )) {
    if (artistFilter.size && !artistFilter.has(artistId)) continue;
    const title = "Singles";
    const id = `${artistId}-singles`;
    if (titles.length > 5)
      throw Error(`${artistId} exceeds the five-single limit`);
    const wanted = new Map(
      titles.map((title) => [normalizeTitle(title), title]),
    );
    const releases = await Promise.all(
      releaseIds.map(async (appleId) => {
        const url = `https://itunes.apple.com/lookup?id=${appleId}&entity=song&country=us&limit=200`;
        const { results } = await get(url, `album-${appleId}.json`);
        const meta = results.find((row) => row.wrapperType === "collection");
        if (!meta) throw Error(`Missing metadata for ${title} (${appleId})`);
        return {
          url,
          meta,
          tracks: results.filter((row) => row.kind === "song"),
        };
      }),
    );
    const { meta } = releases[0];
    const cover = `/covers/${id}.jpg`;
    const coverFile = path.join(root, "public", cover.slice(1));
    try {
      await readFile(coverFile);
    } catch {
      const response = await fetch(
        meta.artworkUrl100.replace(/100x100bb\.(jpg|png)/, "600x600bb.jpg"),
        { signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok)
        throw Error(`Missing cover for ${title}: HTTP ${response.status}`);
      await writeFile(coverFile, Buffer.from(await response.arrayBuffer()));
    }
    const album = catalog.albums.find((entry) => entry.id === id) ?? {
      id,
      artistIds: [artistId],
      title,
      year,
      cover,
      singles: true,
      defaultSelected: true,
      sourceUrl: meta.collectionViewUrl,
    };
    if (!catalog.albums.includes(album)) catalog.albums.push(album);
    for (const song of catalog.songs) {
      if (!song.albumIds.includes(id) || wanted.has(normalizeTitle(song.title)))
        continue;
      song.albumIds = song.albumIds.filter((albumId) => albumId !== id);
      if (song.albumId === id) song.albumId = song.albumIds[0];
      if (!song.albumId) songMap.delete(songKey(song.artistIds, song.title));
    }
    catalog.songs = catalog.songs.filter((song) => song.albumId);
    catalog.sources = catalog.sources.filter((source) => source.albumId !== id);
    for (const { url, tracks } of releases) {
      let trackCount = 0;
      for (const track of tracks) {
        if (/\bInstrumental[)\]]$/i.test(track.trackName)) continue;
        const normalized = normalizeTitle(canonicalTitle(track.trackName));
        const trackTitle = wanted.get(normalized);
        if (!trackTitle) continue;
        const key = songKey(album.artistIds, trackTitle);
        const existing = songMap.get(key);
        if (existing && !existing.albumIds.includes(id)) continue;
        addSong({ ...track, trackName: trackTitle }, album, album.artistIds);
        trackCount++;
      }
      catalog.sources.push({
        provider: "Apple iTunes public lookup API",
        url,
        albumId: id,
        retrievedAt: new Date().toISOString().slice(0, 10),
        trackCount,
      });
    }
  }
}
if (singlesOnly) {
  await importSingles();
  const groups = new Set(
    Object.keys(singles)
      .filter((id) => !artistFilter.size || artistFilter.has(id))
      .map((id) => `${id}-singles`),
  );
  await checkpoint((song) => song.albumIds.some((id) => groups.has(id)));
  process.exit(0);
}
for (const [albumId, artistId, credit] of [
  ["kanye-west-watch-the-throne", "jay-z"],
  ["jpegmafia-scaring-the-hoes", "danny-brown", "JPEGMAFIA & Danny Brown"],
  ["jay-z-everything-is-love", "beyonce", "The Carters"],
]) {
  const album = catalog.albums.find((entry) => entry.id === albumId);
  if (!album || !catalog.artists.some((entry) => entry.id === artistId))
    continue;
  if (!album.artistIds.includes(artistId)) album.artistIds.push(artistId);
  if (credit) album.credit = credit;
  for (const song of catalog.songs.filter((s) =>
    s.albumIds.includes(albumId),
  )) {
    if (!song.artistIds.includes(artistId)) song.artistIds.push(artistId);
  }
}
for (const {
  artistId,
  title,
  year,
  sourceUrl,
  cover,
  tracks,
} of expandedPhysicalAlbums) {
  if (append && artistFilter.size && !artistFilter.has(artistId)) continue;
  const id = `${artistId}-${slug(title)}`;
  if (catalog.albums.some((album) => album.id === id)) continue;
  const album = {
    id,
    artistIds: [artistId],
    title,
    year,
    sourceUrl,
    cover,
    defaultSelected: true,
  };
  catalog.albums.push(album);
  for (const name of tracks) addSong({ title: name }, album, album.artistIds);
  catalog.sources.push({
    provider: "Original release track listing",
    url: sourceUrl,
    albumId: id,
    trackCount: tracks.length,
  });
}
catalog.issues = catalog.issues.filter(
  (issue) => !issue.startsWith("MF DOOM / Take Me to Your Leader:"),
);
for (const { artistId, albumTitle, sourceUrl, tracks } of expandedBonusTracks) {
  if (append && artistFilter.size && !artistFilter.has(artistId)) continue;
  const album = catalog.albums.find(
    (entry) => entry.artistIds.includes(artistId) && entry.title === albumTitle,
  );
  if (!album) continue;
  for (const title of tracks)
    addSong({ title, trackViewUrl: sourceUrl }, album, album.artistIds);
  if (
    !catalog.sources.some(
      (source) => source.albumId === album.id && source.url === sourceUrl,
    )
  )
    catalog.sources.push({
      provider: "Original release track listing",
      url: sourceUrl,
      albumId: album.id,
      trackCount: tracks.length,
    });
}
if (append) {
  await checkpoint();
  process.exit(0);
}
// Supplemental original-release tracks missing from current Apple streaming editions.
const supplements = [
  ["kendrick-lamar", "Section.80", ["The Spiteful Chant"]],
  [
    "kendrick-lamar",
    "Overly Dedicated",
    [
      "The Heart Pt. 2",
      "Night of the Living Junkies",
      "Heaven & Hell",
      "I Do This (Remix)",
    ],
  ],
  ["kanye-west", "Graduation", ["Bittersweet Poetry"]],
  ["frank-ocean", "Channel Orange", ["Golden Girl"]],
];
for (const [artistId, title, titles] of supplements) {
  const album = catalog.albums.find(
    (a) => a.artistIds.includes(artistId) && a.title === title,
  );
  if (!album) continue;
  for (const t of titles) addSong({ title: t }, album, [artistId]);
}
catalog.sources.push(
  {
    provider: "Original-release supplemental metadata",
    url: "https://en.wikipedia.org/wiki/Overly_Dedicated#Track_listing",
    notes:
      "Four original-mixtape tracks absent from current Apple edition restored; all original 16 titles included.",
  },
  {
    provider: "Japanese bonus-track listing",
    url: "https://www.neowing.co.jp/product/UICY-91136/track?from_cdj=1",
    notes: "Graduation: Bittersweet Poetry.",
  },
  {
    provider: "Original CD hidden-track metadata",
    url: "https://en.wikipedia.org/wiki/Channel_Orange#Track_listing",
    notes: "Channel Orange: Golden Girl.",
  },
);
// Endless audio reissue: canonical CD/LP sequence (2017), visual album first released 2016.
// Source: https://en.wikipedia.org/wiki/Endless_(Frank_Ocean_album)#Track_listing
const endless = {
  id: "frank-ocean-endless",
  artistIds: ["frank-ocean"],
  title: "Endless",
  year: 2016,
  cover: "/covers/frank-ocean-endless.jpg",
  defaultSelected: true,
  sourceUrl: "https://music.apple.com/us/music-video/endless/1143705097",
  edition: "CD/LP audio reissue",
};
catalog.albums.push(endless);
const endlessTracks = [
  ["At Your Best (You Are Love)", 321],
  ["Alabama", 85],
  ["Mine", 32],
  ["Unity", 174],
  ["A Certain Way", 11],
  ["Comme Des Garçons", 59],
  ["Xenons", 31],
  ["Honeybaby", 9],
  ["Wither", 154],
  ["Hublots", 108],
  ["In Here Somewhere", 105],
  ["Slide on Me", 187],
  ["Sideways", 114],
  ["Florida", 75],
  ["Impietas + Deathwish", 116],
  ["Rushes", 206],
  ["Rushes To", 132],
  ["Higgs", 219],
  ["Mitsubishi Sony", 171],
];
for (const [title, duration] of endlessTracks)
  addSong({ title, duration }, endless, ["frank-ocean"]);
catalog.sources.push({
  provider:
    "Official physical edition track listing cross-checked with MusicBrainz",
  url: "https://en.wikipedia.org/wiki/Endless_(Frank_Ocean_album)#Track_listing",
  albumId: endless.id,
  retrievedAt: catalog.updatedAt,
  trackCount: endlessTracks.length,
});
try {
  const dest = path.join(root, "public/covers/frank-ocean-endless.jpg");
  try {
    await readFile(dest);
  } catch {
    const response = await fetch(
      "https://coverartarchive.org/release/c14006ec-8b09-4fcd-addd-e5a2960013d0/front-500",
      { signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok) throw Error("cover not returned");
    await writeFile(dest, Buffer.from(await response.arrayBuffer()));
  }
} catch {
  endless.cover = "/record.svg";
  catalog.issues.push(
    "Endless cover could not be retrieved; catalog metadata and songs are included.",
  );
}
catalog.issues.push(
  "Song quality defaults to a transparent neutral prior where verified RYM ratings are unavailable. Popularity is merged from public Kworb Spotify totals where matched.",
);
catalog.issues.push(
  "YouTube availability is validated at playback time; video-sources.json is maintained separately.",
);
await importSingles();
await checkpoint();
console.log(
  JSON.stringify(
    {
      artists: catalog.artists.length,
      albums: catalog.albums.length,
      songs: catalog.songs.length,
      issues: catalog.issues,
    },
    null,
    2,
  ),
);
