/** Public ratings evidence and catalog merge. No API keys, no fabricated RYM values.
 * node scripts/ratings-import.mjs --apply
 * node scripts/ratings-import.mjs --refresh-popularity --apply
 * Add verified RYM records to public/ratings.json quality[] to extend coverage.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const minimumSingleRatingCount = 40;

export function normalizeTitle(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ni\*\*as/g, "niggas")
    .replace(/\bn\*{4}z\b/g, "niggaz")
    .replace(/\bn\*{3}a\b/g, "nigga")
    .replace(/\bf\*{2}k\b/g, "fuck")
    .replace(/\bf\*{4}d\b/g, "fucked")
    .replace(/\bf\*{5}g\b/g, "fucking")
    .replace(/^f\*+g young\s*\/\s*perfect\b/, "fucking young / perfect")
    .replace(
      /^(the brown stains of darkeese latifah part 6-12)\s*\(remix\)/,
      "$1",
    )
    .replace(
      /^dirt off your shoulders(?=\s*\/\s*lying from you\b)/,
      "dirt off your shoulder",
    )
    .replace(
      /^a6\s*(?:\(|[-–—]\s*)meteora[|l]20 demo\)?$/i,
      "a6 meteora20 demo",
    )
    .replace(/\s*[([](?:feat\.?|featuring|with)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([](?:original|lp version|bonus (?:track|version))[)\]]/g, "")
    .replace(
      /\s*[-–—]\s*(?:single version|bbc (?:mark goodier|john peel) session(?: \d+)?)$/g,
      "",
    )
    .replace(
      /^pigs on the wing,?\s+(?:pt\.?\s*)?([12])$/,
      "pigs on the wing part $1",
    )
    .replace(/^(elevators)\s+\(me\s*&\s*you\)$/, "$1")
    .replace(/^(mx)\s+\(including hidden tracks.*\)$/, "$1")
    .replace(/\s*(?:\(\d{4} mix\)|[-–—]\s*\d{4} mix)$/i, "")
    .replace(
      /\s*(?:[-–—]\s*|\()from (?:black panther: wakanda forever|the ["“]home["”] soundtrack).*$/i,
      "",
    )
    .replace(
      /\s*[-–—]\s*(?:\d{4}\s*)?(?:remaster(?:ed)?|mono|stereo|deluxe|album version|explicit|radio edit).*$/gi,
      "",
    )
    .replace(
      /\s*[([](?:\d{4}\s*)?(?:remaster(?:ed)?|mono|stereo|album version|explicit)[^)\]]*[)\]]/gi,
      "",
    )
    .replace(/\b(?:feat\.?|featuring)\b.*$/gi, "")
    .replace(/\b(?:pt\.?|part)\s*(\d+)/g, "part$1")
    .replace(/\s*[-–—]\s*(?:remix|mix).*$/gi, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}
const artistAlias = (id) =>
  id === "beatles" ? "the-beatles" : id === "kanye" ? "kanye-west" : id;
const minimumRatingCount = 15;
export function applyRatings(catalog, data) {
  const q = new Map(),
    p = new Map();
  for (const r of data.quality || []) {
    const scope = r.albumId ? `album:${r.albumId}` : r.artistId;
    const key = `${scope}:${normalizeTitle(r.title)}`;
    if (!q.has(key) || r.ratingCount > q.get(key).ratingCount) q.set(key, r);
  }
  for (const r of data.popularity || []) {
    const scope = r.albumId ? `album:${r.albumId}` : r.artistId;
    const key = `${scope}:${normalizeTitle(r.title)}`;
    if (!p.has(key) || r.streams > p.get(key).streams) p.set(key, r);
  }
  let qualityMatches = 0,
    popularityMatches = 0;
  const songs = catalog.songs.map((song) => {
    const title = normalizeTitle(song.title);
    let quality = q.get(`album:${song.albumId}:${title}`);
    let popularity = p.get(`album:${song.albumId}:${title}`);
    for (const artist of song.artistIds) {
      const key = `${artistAlias(artist)}:${title}`;
      quality ||= q.get(key);
      const next = p.get(key);
      if (next && (!popularity || next.streams > popularity.streams))
        popularity = next;
    }
    const sparseQuality = quality && quality.ratingCount < minimumRatingCount;
    if (quality && !sparseQuality) qualityMatches++;
    if (popularity) popularityMatches++;
    if (!quality && !popularity) return song;
    return {
      ...song,
      quality: sparseQuality ? 50 : (quality?.quality ?? song.quality),
      popularity: popularity?.popularity ?? song.popularity,
      qualitySource: quality
        ? {
            provider: sparseQuality ? "Initial estimate" : "Rate Your Music",
            rating: quality.rating,
            ratingCount: quality.ratingCount,
            ratingCountDisplay: quality.ratingCountDisplay,
            note: sparseQuality
              ? `Neutral 50/100 because RYM has fewer than ${minimumRatingCount} ratings.`
              : quality.note,
            url: quality.sourceUrl,
            retrievedAt: quality.retrievedAt,
          }
        : song.qualitySource,
      popularitySource: popularity
        ? {
            provider:
              popularity.provider ?? "Kworb / Spotify public stream totals",
            streams: popularity.streams,
            streamsDisplay: popularity.streamsDisplay,
            url: popularity.sourceUrl,
            sourceUpdatedAt: popularity.sourceUpdatedAt,
            scaleArtistId: popularity.scaleArtistId,
            retrievedAt: popularity.retrievedAt,
          }
        : song.popularitySource,
      scoreSource: [
        sparseQuality
          ? `Quality: 50/100 estimate (fewer than ${minimumRatingCount} RYM ratings)`
          : quality
            ? `RYM ${quality.rating.toFixed(2)}/5 (${quality.ratingCountDisplay ?? quality.ratingCount.toLocaleString("en-US")} ratings)`
            : song.qualitySource?.provider === "Rate Your Music"
              ? "Verified RYM"
              : "Quality: initial estimate",
        popularity
          ? `Popularity: log-normalized public Spotify streams (${popularity.provider ?? "Kworb"})`
          : "Popularity: initial estimate",
      ].join(" · "),
      youtubeId: song.youtubeId || quality?.youtubeId,
    };
  });
  return {
    catalog: { ...catalog, songs, ratingsUpdatedAt: data.updatedAt },
    qualityMatches,
    popularityMatches,
  };
}

const spotifyIds = {
  "bob-dylan": "74ASZWbe4lXaubB36ztrGX",
  "neil-young": "6v8FB84lnmJs434UJf2Mrm",
  "john-coltrane": "2hGh5VOeeqimQFxqXvfCUf",
  "jimi-hendrix": "776Uo845nYHJpNaStv1Ds4",
  "david-bowie": "0oSGxfWSnnOXhD2fKuz2Gy",
  "talking-heads": "2x9SpqnPi8rlE9pjHBwmSC",
  "tom-waits": "7x83XhcMbOTl1UdYsPTuZM",
  "the-who": "67ea9eGLXYMsO2eYQRui3w",
  "bruce-springsteen": "3eqjTLE0HfPfh78zjh6TqT",
  ramones: "1co4F2pPNH8JjTutZkmgSm",
  kraftwerk: "0dmPX6ovclgOy8WWJaFEUU",
  bjork: "7w29UYBi0qsHi5RTcv3lmA",
  pixies: "6zvul52xwTWzilBZl6BUbT",
  wilco: "7FIoB5PHdrMZVC3q2HE5MS",
  "50-cent": "3q7HBObVc0L8jNeTe5Gofh",
  "playboi-carti": "699OTQXzgjhIYAHMy9RyPD",
  smino: "1ybINI1qPiFbwDXamRtwxD",
  "sufjan-stevens": "4MXUO7sVCaFgFjoTI5ox5c",
  mitski: "2uYWxilOVlUdk4oV9DvwqK",
  "danny-brown": "7aA592KWirLsnfb5ulGWvU",
  "freddie-gibbs": "0Y4inQK6OespitzD6ijMwb",
  portishead: "6liAMWkVf5LH7YR9yfFy1Y",
  "aphex-twin": "6kBDZFXuLrZgHnvmPu9NsG",
  beyonce: "6vWDO969PvNqNYHIOW5v0m",
  "green-day": "7oPftvlwr6VrsViSDV7fJY",
  "nine-inch-nails": "0X380XXQSNBYuleKzav5UO",
  "rage-against-the-machine": "2d0hyoQ5ynDBnkvAbJKORj",
  "the-beach-boys": "3oDbviiivRWhXwIE8hxkVV",
  "the-clash": "3RGLhK1IP9jnYFH4BRFJBS",
  "creedence-clearwater-revival": "3IYUhFvPQItj6xySrBmZkd",
  "ac-dc": "711MCceyCBcFnzjGY4Q7Un",
  metallica: "2ye2Wgw4gimLv2eAKyk1NB",
  "black-sabbath": "5M52tdBnJaKSvOpJGz8mfZ",
  "led-zeppelin": "36QJpDe2go2KgaRleHCDTp",
  "the-rolling-stones": "22bE4uQ6baNwSHPVcDxLCe",
  "al-green": "3dkbV4qihUeMsqN4vBGg93",
  "ray-charles": "1eYhYunlNJlDoQhtYBvPsi",
  "aretha-franklin": "7nwUJBm0HE4ZxD3f5cy5ok",
  "sam-cooke": "6hnWRPzGGKiapVX1UCdEAC",
  "marvin-gaye": "3koiLjNrgRTNbOwViDipeA",
  "otis-redding": "60df5JBRRPcnSpsIMxxwQm",
  "mary-j-blige": "1XkoF8ryArs86LZvFOkbyr",
  "curtis-mayfield": "2AV6XDIs32ofIJhkkDevjm",
  prince: "5a2EaR3hamoenG9rDuVn8j",
  "r-kelly": "2mxe0TnaNL039ysAj51xPQ",
  "j-cole": "6l3HvQ5sa6mXTsMTB19rO5",
  gorillaz: "3AA28KZvwAUcZuOKwyblJQ",
  "the-weeknd": "1Xyo4u8uXC1ZmMpatF05PJ",
  "daft-punk": "4tZwfgrHOc3mvqYlEYSvVi",
  "arctic-monkeys": "7Ln80lUS6He07XvHI8qqHH",
  "mac-miller": "4LLpKhyESsyAXpc4laK94U",
  "tame-impala": "5INjqkS1o8h1imAzPqGZBb",
  deftones: "6Ghvu1VvMGScGpOUJBAHNH",
  paramore: "74XFHRwlV6OrjEM0A2NCMF",
  sza: "7tYKF4w9nC0nq9CsPZTHyP",
  outkast: "1G9G7WwrXka3Z1r7aIDjI7",
  "fleetwood-mac": "08GQAI4eElDnROBrJRGE0X",
  "pink-floyd": "0k17h0D3J5VfsdmQ1iZtE9",
  "lana-del-rey": "00FQb4jTyendYWaN8pK0wa",
  "the-cure": "7bu3H8JO7d0UbMoVzbo70s",
  "stevie-wonder": "7guDJrEfX3qb6FEbdPA5qi",
  nirvana: "6olE6TJLqED3rqDCT0FyPh",
  "kanye-west": "5K4W6rqBFWDnAN6FQUkS6x",
  "kid-cudi": "0fA0VVWsXO9YnASrzqfmYu",
  "frank-ocean": "2h93pZq0e7k5yf4dywlkpM",
  "kendrick-lamar": "2YZyLoL8N0Wb9xBt1NhZWg",
  "the-beatles": "3WrFJ7ztbogyGnTHbHJFl2",
  queen: "1dfeR4HaWDbWqFHLkxsg1d",
  "michael-jackson": "3fMbdgg4jU18AjLCKBhRSm",
  abba: "0LcJLqbBmaGUft1e9Mm8HV",
  rihanna: "5pKCCKE2ajJHZ9KAiaK11H",
  "kids-see-ghosts": "2hPgGN4uhvXAxiXQBIXOmE",
  "jay-z": "3nFkdlSjzX9mRTtwJOzDYB",
  "earl-sweatshirt": "3A5tHz1SfngyOZM2gItYKu",
  "vince-staples": "68kEuyFKyqrdQQLLsmiatm",
  eminem: "7dGJo4pcD2V6oG8kP0tJRR",
  "james-blake": "53KwLdlmrlCelAZMaLVZqU",
  jpegmafia: "6yJ6QQ3Y5l0s0tn7b0arrO",
  "mf-doom": "2pAWfrd7WFF3XhVt9GooDL",
  "a-tribe-called-quest": "09hVIj6vWgoCDtT03h8ZCa",
  "young-thug": "50co4Is1HCEo8bhOyUWKpn",
  "action-bronson": "7BMccF0hQFBpP6417k1OtQ",
  "alex-g": "6lcwlkAjBPSKnFBZjjZFJs",
  drake: "3TVXtAsR1Inumwj472S9r4",
  radiohead: "4Z8W4fKeB5YxbusRsdQVPb",
  "olivia-rodrigo": "1McMsnEElThX1knmY4oliG",
  "tyler-the-creator": "4V8LLVI7PbaPR0K2TGSxFF",
  "linkin-park": "6XyY86QOPPrYVGvF9ch6wz",
  madvillain: "2aoFQUeHD1U7pL098lRsDU",
  "viktor-vaughn": "0wIb0PhwT3disoWykRhq6V",
  "king-geedorah": "77AKJs9SJqxHXbPgtJPKRa",
};
const collaboration = {
  "kids-see-ghosts": {
    albumId: "kanye-west-kids-see-ghosts",
    scaleArtistId: "kanye-west",
  },
  madvillain: { albumId: "mf-doom-madvillainy", scaleArtistId: "mf-doom" },
  "viktor-vaughn": {
    albumId: "mf-doom-vaudeville-villain",
    scaleArtistId: "mf-doom",
  },
  "king-geedorah": {
    albumId: "mf-doom-take-me-to-your-leader",
    scaleArtistId: "mf-doom",
  },
};
function decode(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .trim();
}
export async function refreshPopularity(data, onlyArtist) {
  for (const [artistId, spotifyId] of Object.entries(spotifyIds)) {
    if (onlyArtist && artistId !== onlyArtist) continue;
    const scope = collaboration[artistId];
    const sourceUrl = `https://kworb.net/spotify/artist/${spotifyId}_songs.html`;
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "MusicBracket catalog updater; contact: local-user",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`${artistId}: HTTP ${response.status}`);
    const html = await response.text(),
      rows = [];
    for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (m) => m[1],
      );
      if (cells.length < 3) continue;
      const anchor = cells[0].match(
        /<a[^>]*href="(https:\/\/open\.spotify\.com\/track\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!anchor) continue;
      const streams = Number(decode(cells[1]).replaceAll(",", "")),
        daily = Number(decode(cells[2]).replaceAll(",", ""));
      if (!Number.isFinite(streams) || streams < 1) continue;
      rows.push({
        artistId,
        ...scope,
        title: decode(anchor[2]),
        streams,
        daily,
        spotifyUrl: anchor[1],
        sourceUrl,
        sourceUpdatedAt: html.match(
          /Last updated:\s*(\d{4}\/\d{2}\/\d{2})/,
        )?.[1],
        retrievedAt: new Date().toISOString().slice(0, 10),
      });
    }
    if (rows.length < 5)
      throw Error(
        `${artistId}: no reliable stream table found; existing evidence retained.`,
      );
    const scale = scope
      ? data.popularity.filter((r) => r.artistId === scope.scaleArtistId)
      : rows;
    const max = Math.max(...scale.map((r) => r.streams)),
      min = Math.min(...scale.map((r) => r.streams));
    if (!(max > min && min > 0))
      throw Error(`${artistId}: missing popularity scale`);
    const logMin = Math.log1p(min);
    const logRange = Math.log1p(max) - logMin;
    for (const row of rows) {
      const fraction = (Math.log1p(row.streams) - logMin) / logRange;
      row.popularity =
        Math.round(10000 * Math.min(1, Math.max(0, fraction))) / 100;
    }
    data.popularity = [
      ...data.popularity.filter((r) => r.artistId !== artistId),
      ...rows,
    ];
    console.log(`${artistId}: ${rows.length} stream records`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  data.updatedAt = new Date().toISOString().slice(0, 10);
  return data;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ratingsPath = path.join(root, "public/ratings.json"),
    catalogPath = path.join(root, "public/catalog.json");
  let data = JSON.parse(await readFile(ratingsPath, "utf8"));
  if (process.argv.includes("--refresh-popularity")) {
    data = await refreshPopularity(
      data,
      process.argv.find((arg) => arg.startsWith("--artist="))?.slice(9),
    );
    await writeFile(ratingsPath, JSON.stringify(data, null, 2) + "\n");
  }
  if (process.argv.includes("--apply")) {
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const result = applyRatings(catalog, data);
    await writeFile(
      catalogPath,
      JSON.stringify(result.catalog, null, 2) + "\n",
    );
    console.log(
      `Applied verified RYM ratings to ${result.qualityMatches} songs, public Spotify popularity to ${result.popularityMatches} songs.`,
    );
  } else
    console.log(
      `${data.quality.length} verified RYM records; ${data.popularity.length} stream records. Add --apply to merge catalog; --refresh-popularity refreshes Kworb tables. RYM is never guessed.`,
    );
}
