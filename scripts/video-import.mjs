/** Merge published video IDs into the catalog. Never guesses YouTube IDs.
 * node scripts/video-import.mjs [--apply]
 * Optional --search fetches YouTube search metadata for unresolved songs, slowly,
 * caching each successful result. No audio/video content is downloaded.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
};
const data = await readJson("public/video-sources.json", {
  version: 1,
  updatedAt: new Date().toISOString(),
  sources: [],
});
const ratings = await readJson("public/ratings.json", { quality: [] });
const canonicalTitle = (title) =>
  normalizeTitle(
    title
      .replace(/ni\*\*as/gi, "niggas")
      .replace(/blkkk\s+skkkn\s+head/gi, "black skinhead")
      .replace(/^(untitled \d{2})\s+[lI|].*$/i, "$1")
      .replace(/\s*\((?:nightmare|english version|b-side)\)$/i, "")
      .replace(/\s*\(Kanye West\/Late Registration\)$/i, ""),
  );
const key = (r) =>
  r.songId ? `song:${r.songId}` : `${r.artistId}:${canonicalTitle(r.title)}`;
const artistFilter = new Set(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--artist="))
    .map((arg) => arg.slice(9)),
);
const sources = new Map(data.sources.map((r) => [key(r), r]));
// Title spelling or shared credits make these recordings difficult to match automatically.
const reviewedLinks = [
  ["kendrick-lamar", "The Hillbillies", "nsCsM1xqiTY"],
  ["vince-staples", "Get the Fuck Off My Dick", "G5k6AVqLmA0"],
  ["vince-staples", "Sheet Music (Episode 02)", "2A10MrtzoNw"],
  ["lana-del-rey", "Tough", "R2hgq8j6ETY"],
  ["mary-j-blige", "As", "3V726_HShyY"],
  ["prince", "Erotic City", "KY4gnToCXa4"],
  ["paramore", "Still Into You", "OblL026SvD4"],
  ["deftones", "Sextape", "f0pdwd0miqs"],
  ["deftones", "Entombed", "gEXbHKAuHSg"],
  ["tame-impala", "Dracula", "xnP7qKxwzjg"],
  ["nirvana", "All Apologies", "URVxyDJnJF0"],
  ["nirvana", "Rape Me", "JtWaCViY_tc"],
  ["daft-punk", "Give Life Back to Music", "IluRBvnYMoY", "zKSsP2084nU"],
  ["kanye-west", "All of the Lights", "HAfFfqiYLp0"],
  ["kanye-west", "All of the Lights (Interlude)", "WHxRd_va950"],
  ["kendrick-lamar", "Savior", "HMIrpcNtk9E", "0MUB6_ObKr4"],
  ["kendrick-lamar", "Savior (Interlude)", "qfEPquKQtrM", "ROUFkWceDRM"],
  ["kanye-west", "Skit #2", "vRBOIbTyTnU", "rC1CmGiT-ZM"],
  [
    "kid-cudi",
    "Enter Galactic (Love Connection, Pt. I)",
    "5oLgQW_63og",
    "w_j79zNYX6E",
  ],
  ["kendrick-lamar", "Fuck Your Ethnicity", "HVulYPJOXHI", "nPSM781kxuo"],
  ["abba", "There’s a Little Man", "-7Gl3L0DP0w"],
  ["abba", "Välkommen Till Världen", "Zd24qOl8jFA"],
  ["abba", "Felicidad (Spanish Version)", "YihxpsmH3cQ"],
  ["abba", "No Hay a Quién Culpar (Spanish Version)", "6qmzmD4POMk"],
  ["rihanna", "If I Never See Your Face Again", "MbtajuiuLMU", "liRbwDLJgH0"],
  ["rihanna", "Love the Way You Lie, Pt. II", "1CozRvwZEAs", "OkOOLSYZNxw"],
  [
    "rihanna",
    "Needed Me",
    "38wlfeXPoZI",
    "DWkN4eNUlJo",
    "Both uploads reached PLAYING after a click on musicbracket.localhost:19473 on 2026-11-20.",
  ],
  ["rihanna", "Sex with Me", "k4X9bXkKUJE", "Rr1nY2mi1uU"],
  ["frank-ocean", "A Certain Way", "uW8_KcOnPcs"],
  ["olivia-rodrigo", "lacy", "_IB5EYuz3XM"],
  ["olivia-rodrigo", "making the bed", "OuuBnf2aGCc"],
  ["olivia-rodrigo", "girl i’ve always been", "1-dT9r5nbks"],
  ["tyler-the-creator", "F*****G YOUNG / PERFECT", "fCSq2NKk9ng"],
  ["tyler-the-creator", "I Ain't Got Time!", "9RsIFKxP47s"],
  ["tyler-the-creator", "Down Bad", "t2B4J1lGCqU", "LgNwKCLefIQ"],
  ["linkin-park", "Session", "J1KqQYsUYIk", "VWztwocVnZM"],
  ["linkin-park", "A6 (Meteoral20 Demo)", "YNo3JMxj8RU", "wfa2EUDm0t0"],
  ["linkin-park", "Burning In the Skies", "kh_YCSW5lPc"],
  ["linkin-park", "LIES GREED MISERY", "9Dq9q6afIP8"],
  ["linkin-park", "Keys to the Kingdom", "ZPlUjhroNd4"],
  ["linkin-park", "The Emptiness Machine", "SRXH9AbT280"],
  ["linkin-park", "Heavy Is the Crown", "5FrhtahQiRc"],
];
for (const [
  artistId,
  title,
  youtubeId,
  backupYoutubeId,
  verification,
] of reviewedLinks) {
  const record = {
    artistId,
    title,
    youtubeId,
    backupYoutubeId,
    sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    retrievedAt: new Date().toISOString().slice(0, 10),
    verification:
      verification ??
      "Title and recording manually matched to the published video.",
  };
  if (sources.get(key(record))?.youtubeId !== youtubeId)
    sources.set(key(record), record);
}
let writeQueue = Promise.resolve();
for (const rating of ratings.quality || [])
  if (/^[\w-]{11}$/.test(rating.youtubeId || "") && !sources.has(key(rating))) {
    sources.set(key(rating), {
      artistId: rating.artistId,
      title: rating.title,
      youtubeId: rating.youtubeId,
      sourceUrl: rating.sourceUrl,
      retrievedAt: rating.retrievedAt,
      verification: "Published RYM source link; playback checked at runtime",
    });
  }
if (process.argv.includes("--kworb")) {
  const artists = [
    ["kanye-west", "kanyewest"],
    ["kid-cudi", "kidcudi"],
    ["frank-ocean", "frankocean"],
    ["kendrick-lamar", "kendricklamar"],
    ["the-beatles", "thebeatles"],
    ["queen", "queen"],
    ["michael-jackson", "michaeljackson"],
    ["abba", "abba"],
    ["rihanna", "rihanna"],
  ];
  for (const [artistId, slug] of artists) {
    const sourceUrl = `https://kworb.net/youtube/artist/${slug}.html`;
    try {
      const response = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const html = await response.text();
      for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const link = row[1].match(
          /<a[^>]+href=["'][^"']*video\/([\w-]{11})\.html["'][^>]*>([\s\S]*?)<\/a>/i,
        );
        if (!link) continue;
        const videoTitle = decode(link[2].replace(/<[^>]+>/g, ""));
        // Featured appearances are not imported as this artist's own songs.
        if (/^\s*\*/.test(row[1].replace(/<[^>]+>/g, ""))) continue;
        let title = videoTitle
          .replace(/^[^–—]+?\s+[–—-]\s+/, "")
          .replace(/^The Beatles\s+-\s+/i, "")
          .replace(
            /\s*\([^)]*(?:official|video|audio|lyric|remaster|live|mix|version)[^)]*\)/gi,
            "",
          )
          .replace(/\s*\[[^\]]*\]/g, "")
          .replace(/\s+(?:ft\.?|feat\.?)\s+.*$/i, "")
          .trim();
        if (
          !title ||
          /\b(?:trailer|interview|behind the scenes|documentary|greatest hits|album trailer)\b/i.test(
            videoTitle,
          )
        )
          continue;
        const record = {
          artistId,
          title,
          youtubeId: link[1],
          sourceUrl,
          videoTitle,
          retrievedAt: new Date().toISOString(),
          verification:
            "Published Kworb YouTube chart link; playback/region checked at runtime",
        };
        const existing = sources.get(key(record));
        if (existing) {
          if (
            existing.youtubeId !== record.youtubeId &&
            !existing.backupYoutubeId
          )
            existing.backupYoutubeId = record.youtubeId;
        } else sources.set(key(record), record);
      }
      console.log(
        `${artistId}: ${[...sources.values()].filter((s) => s.artistId === artistId).length} published mappings`,
      );
      await checkpoint();
    } catch (error) {
      console.error(`${artistId}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}
let catalog = await readJson("public/catalog.json", null);
if (process.argv.includes("--verify")) {
  const singleKeys = new Set(
    (catalog?.songs ?? [])
      .filter((song) => song.albumIds.some((id) => id.endsWith("-singles")))
      .flatMap((song) => [
        `song:${song.id}`,
        ...song.artistIds.map((artistId) =>
          key({ artistId, title: song.title }),
        ),
      ]),
  );
  const pending = [...sources.values()].filter(
      (s) =>
        (!process.argv.includes("--singles-only") || singleKeys.has(key(s))) &&
        (!artistFilter.size || artistFilter.has(s.artistId)) &&
        (!s.metadataCheckedAt ||
          (s.backupYoutubeId && !s.backupMetadataCheckedAt)),
    ),
    concurrency = 10;
  let cursor = 0,
    checked = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < pending.length) {
        const source = pending[cursor++];
        try {
          const response = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${source.youtubeId}&format=json`,
            { signal: AbortSignal.timeout(12000) },
          );
          source.oembedStatus = response.status;
          if (response.ok) {
            const info = await response.json();
            source.videoTitle = info.title;
            source.channel = info.author_name;
            source.metadataCheckedAt = new Date().toISOString();
            source.verification =
              "YouTube oEmbed metadata available; final region/embedding checked at runtime";
          } else {
            source.metadataCheckedAt = new Date().toISOString();
            source.verification = `YouTube oEmbed returned ${response.status}; runtime or replacement needed`;
          }
        } catch (error) {
          source.metadataError = error.message;
        }
        if (source.backupYoutubeId && !source.backupMetadataCheckedAt) {
          try {
            const response = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${source.backupYoutubeId}&format=json`,
              { signal: AbortSignal.timeout(12000) },
            );
            source.backupOembedStatus = response.status;
            source.backupMetadataCheckedAt = new Date().toISOString();
            if (response.ok && source.oembedStatus !== 200) {
              const info = await response.json();
              const prior = source.youtubeId;
              source.youtubeId = source.backupYoutubeId;
              source.backupYoutubeId = prior;
              source.backupOembedStatus = source.oembedStatus;
              source.oembedStatus = 200;
              source.videoTitle = info.title;
              source.channel = info.author_name;
              source.verification =
                "YouTube oEmbed metadata available; final region/embedding checked at runtime";
            }
          } catch (error) {
            source.backupMetadataError = error.message;
          }
        }
        checked++;
        if (checked % 50 === 0) {
          console.log(`Metadata checked ${checked}/${pending.length}`);
          await checkpoint();
        }
      }
    }),
  );
  await checkpoint();
  console.log(`Metadata checks complete: ${checked}`);
}
if (process.argv.includes("--search") && catalog) {
  const artistNames = new Map(catalog.artists.map((a) => [a.id, a.name]));
  const limit = Number(process.env.VIDEO_IMPORT_LIMIT || 25),
    concurrency = Math.min(
      6,
      Math.max(1, Number(process.env.VIDEO_IMPORT_CONCURRENCY || 4)),
    );
  const queue = catalog.songs
    .filter(
      (song) =>
        !process.argv.includes("--singles-only") ||
        song.albumIds.some((id) => id.endsWith("-singles")),
    )
    .sort(
      (a, b) =>
        (a.kind === "song" ? 0 : 1) - (b.kind === "song" ? 0 : 1) ||
        b.popularity - a.popularity,
    );
  let searched = 0,
    cursor = 0,
    completed = 0,
    found = 0,
    blocked = 0,
    connectionFailures = 0,
    stop = false;
  console.log(
    `Searching unresolved catalog videos with ${concurrency} workers (limit ${limit})`,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < queue.length && !stop) {
        const song = queue[cursor++];
        const existingSource =
          sources.get(`song:${song.id}`) ??
          song.artistIds
            .map((artistId) =>
              sources.get(key({ artistId, title: song.title })),
            )
            .find(Boolean);
        if (
          existingSource &&
          (!existingSource.oembedStatus || existingSource.oembedStatus === 200)
        )
          continue;
        if (song.youtubeId && !existingSource) continue;
        if (artistFilter.size && !artistFilter.has(song.artistIds[0])) continue;
        if (searched++ >= limit) break;
        const artistId = song.artistIds[0],
          artist =
            song.albumId === "ka-orpheus-vs-the-sirens"
              ? "Hermit and the Recluse"
              : artistId === "ka"
                ? "Brownsville Ka"
                : artistNames.get(artistId) || artistId;
        const lookupTitle = song.title.replace(
          /^(untitled \d{2})\s+[lI|].*$/i,
          "$1",
        );
        const kaAlbum =
          artistId === "ka"
            ? catalog.albums.find((album) => album.id === song.albumId)?.title
            : undefined;
        const query = [artist, lookupTitle, kaAlbum, "official audio"]
          .filter(Boolean)
          .join(" ");
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        try {
          const response = await fetch(searchUrl, {
            headers: { Connection: "close" },
            signal: AbortSignal.timeout(8000),
          });
          if (response.status === 429 || response.status === 403) {
            blocked++;
            if (response.status === 429 || blocked >= 8) {
              stop = true;
              console.error(
                "Stopping discovery: YouTube rate/access restriction; saved checkpoint retained.",
              );
            }
            throw Error(`Search restricted (${response.status})`);
          } else if (response.ok) blocked = 0;
          const html = await response.text();
          connectionFailures = 0;
          const match = html.match(
            /(?:var\s+)?ytInitialData\s*=\s*(\{.*?\});/s,
          );
          if (!response.ok || !match)
            throw Error(`Search unavailable (${response.status})`);
          const initial = JSON.parse(match[1]),
            results = [];
          const walk = (obj) => {
            if (!obj || typeof obj !== "object") return;
            if (obj.videoRenderer) results.push(obj.videoRenderer);
            for (const child of Object.values(obj))
              if (child && typeof child === "object") walk(child);
          };
          walk(initial);
          const requested = canonicalTitle(song.title);
          const candidates = results
            .map((v) => {
              const title = (v.title?.runs || []).map((r) => r.text).join(""),
                channel = (v.ownerText?.runs || []).map((r) => r.text).join("");
              const kaCredit =
                artistId === "ka" &&
                (/^ka\s*[-–—:]/i.test(title) ||
                  /^ka(?:\s*-\s*topic)?$/i.test(channel));
              const clean = (
                kaCredit ? title.replace(/^ka\s*[-–—:]\s*/i, "") : title
              )
                .replace(
                  new RegExp(
                    `^${artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—:]\\s*`,
                    "i",
                  ),
                  "",
                )
                .replace(
                  /\s*[([][^)\]]*(?:official|audio|video|lyrics?|visuali[sz]er)[^)\]]*[)\]]/gi,
                  "",
                )
                .replace(
                  /\s*[-–—]\s*(?:official|audio|lyrics?|video).*$/gi,
                  "",
                );
              const normalized = canonicalTitle(clean),
                artistMatch =
                  kaCredit ||
                  normalizeTitle(title).includes(normalizeTitle(artist)) ||
                  normalizeTitle(channel).includes(normalizeTitle(artist));
              const titleMatch =
                normalized === requested ||
                (requested.length > 3 &&
                  normalized.startsWith(requested) &&
                  normalized.length < requested.length + 18) ||
                (process.argv.includes("--singles-only") &&
                  artistMatch &&
                  requested.length >= 7 &&
                  normalized.includes(requested) &&
                  normalized.length < requested.length + 65);
              let score = titleMatch ? 10 : -100;
              if (artistMatch) score += 4;
              if (/topic|vevo|official/i.test(channel)) score += 3;
              if (
                /\b(live|cover|reaction|karaoke|instrumental|slowed|sped up|remix)\b/i.test(
                  title,
                ) &&
                !new RegExp("live|instrumental", "i").test(song.title)
              )
                score -= 20;
              return { v, score, titleMatch, artistMatch };
            })
            .filter(
              (c) =>
                c.score >= 14 &&
                c.titleMatch &&
                c.artistMatch &&
                /^[\w-]{11}$/.test(c.v.videoId),
            )
            .sort((a, b) => b.score - a.score);
          if (
            !candidates.length &&
            process.argv.includes("--review-candidates")
          )
            console.log(
              JSON.stringify({
                artist,
                song: song.title,
                review: results.slice(0, 5).map((v) => ({
                  id: v.videoId,
                  title: (v.title?.runs || []).map((r) => r.text).join(""),
                  channel: (v.ownerText?.runs || [])
                    .map((r) => r.text)
                    .join(""),
                })),
              }),
            );
          for (const candidate of candidates.slice(0, 2)) {
            const id = candidate.v.videoId;
            const meta = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
              { signal: AbortSignal.timeout(15000) },
            );
            if (!meta.ok) {
              await meta.body?.cancel();
              continue;
            }
            const info = await meta.json();
            sources.set(key({ artistId, title: song.title }), {
              artistId,
              title: song.title,
              youtubeId: id,
              sourceUrl: searchUrl,
              videoTitle: info.title,
              channel: info.author_name,
              retrievedAt: new Date().toISOString(),
              metadataCheckedAt: new Date().toISOString(),
              oembedStatus: 200,
              verification:
                "YouTube search and oEmbed; embedding/region checked at runtime",
            });
            found++;
            break;
          }
        } catch (error) {
          console.error(
            `${artist} — ${song.title}: ${error.cause?.code || error.message}`,
          );
          if (error instanceof TypeError && ++connectionFailures >= 6)
            stop = true;
        }
        completed++;
        if (completed % 20 === 0) {
          await checkpoint();
          console.log(
            `Discovery ${completed} searched / ${found} found / ${sources.size} total source mappings`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 425));
      }
    }),
  );
  await checkpoint();
  console.log(
    `Discovery complete: ${completed} searched, ${found} new sources${stop ? " (stopped by access restrictions)" : ""}`,
  );
}
await checkpoint();
if (process.argv.includes("--apply") && catalog) {
  catalog = await readJson("public/catalog.json", catalog);
  let matched = 0;
  for (const song of catalog.songs) {
    let record = sources.get(`song:${song.id}`);
    for (const artistId of song.artistIds)
      record ||= sources.get(key({ artistId, title: song.title }));
    if (record) {
      song.youtubeId = record.youtubeId;
      song.backupYoutubeId = record.backupYoutubeId;
      song.videoSource = {
        url: record.sourceUrl,
        verification: record.verification,
        retrievedAt: record.retrievedAt,
      };
      matched++;
    }
  }
  await writeJson("public/catalog.json", catalog);
  console.log(
    `Applied ${matched} video mappings to ${catalog.songs.length} catalog songs`,
  );
}
console.log(`Published video source mappings: ${sources.size}`);
function checkpoint() {
  writeQueue = writeQueue.then(() =>
    writeJson("public/video-sources.json", {
      ...data,
      updatedAt: new Date().toISOString(),
      sources: [...sources.values()],
    }),
  );
  return writeQueue;
}
async function writeJson(file, value) {
  const pending = `${file}.tmp`;
  await writeFile(pending, JSON.stringify(value, null, 2));
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(pending, file);
      return;
    } catch (error) {
      if (
        attempt === 7 ||
        !["EPERM", "EACCES", "EBUSY", "UNKNOWN"].includes(error.code)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 125 * (attempt + 1)));
    }
  }
}
function decode(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
