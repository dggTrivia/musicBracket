import fs from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";
const picks = JSON.parse(
  await fs.readFile("tmp/singles-audit/approved-picks.json", "utf8"),
);
const metadata = JSON.parse(
  await fs.readFile("tmp/singles-audit/final-metadata.json", "utf8"),
);
const catalog = JSON.parse(await fs.readFile("public/catalog.json", "utf8"));
const ratings = JSON.parse(await fs.readFile("public/ratings.json", "utf8"));
const manifest = {};
const audit = [];
const artistAliases = {
  "mf-doom": ["mfdoom", "doom", "madvillain"],
  "kid-cudi": ["kidcudi", "thescotts"],
  "a-tribe-called-quest": ["atribecalledquest", "tribecalledquest"],
  "playboi-carti": ["playboicarti"],
  "j-cole": ["jcole"],
  "the-weeknd": ["theweeknd", "weeknd"],
  "tame-impala": ["tameimpala"],
  "sufjan-stevens": ["sufjanstevens"],
  "mary-j-blige": ["maryjblige", "georgemichael"],
  beyonce: ["beyonce"],
  bjork: ["bjork"],
};
const popularityKey = (title) =>
  normalizeTitle(
    title
      .replace(
        /\s*[-–—]\s*(?:from\b|.*soundtrack|original single|single version|\d{4} remaster|.*\b[ab]-side\b|mono version|stereo version).*$/i,
        "",
      )
      .replace(
        /\s*\((?:w\/|single version|mono version|stereo version|.*remaster|from\b).*$/i,
        "",
      )
      .replace(/\s*\[(?:\d{4} remaster|single version|mono version)\].*$/i, ""),
  );
for (const artist of picks) {
  const tracks = [];
  const decisions = [];
  for (const pick of artist.decisions) {
    if (pick.status !== "approved-for-metadata-check") {
      decisions.push(pick);
      continue;
    }
    const key = normalizeTitle(pick.title);
    const acceptable = artistAliases[artist.artistId] ?? [
      normalizeTitle(artist.name),
    ];
    const releases = (
      metadata[artist.artistId + ":" + key]?.releases ?? []
    ).filter(
      (r) =>
        acceptable.some((n) => normalizeTitle(r.artist).includes(n)) &&
        !/\b(live|karaoke|tribute|instrumental|remix|acoustic)\b/i.test(
          r.collection + " " + r.title,
        ),
    );
    const apple = releases.sort(
      (a, b) =>
        Number(/single/i.test(b.collection)) -
        Number(/single/i.test(a.collection)),
    )[0];
    const onAlbum =
      apple &&
      catalog.albums.find(
        (a) =>
          !a.singles &&
          a.artistIds.includes(artist.artistId) &&
          a.appleId === apple.collectionId,
      );
    if (onAlbum) {
      decisions.push({
        title: pick.title,
        status: "already-on-album-edition",
        albumId: onAlbum.id,
      });
      continue;
    }
    const measured = pick.quality;
    const release = pick.release;
    const quality = measured ?? {
      artistId: artist.artistId,
      title: pick.title,
      rating: release.rating,
      ratingCount: release.ratingCount,
      quality: Math.round(release.rating * 2000) / 100,
      sourceUrl: release.sourceUrl,
      retrievedAt: artist.retrievedAt,
      note: release.title.includes(" / ")
        ? `RYM rating of the original single release (${release.title}); release-level score, not an individual track rating.`
        : "RYM original single release rating.",
    };
    // Reuse measured public streams, including a jointly credited track's other artist table.
    let popularity =
      ratings.popularity
        .filter(
          (p) =>
            p.artistId === artist.artistId &&
            popularityKey(p.title) === popularityKey(pick.title),
        )
        .sort((a, b) => b.streams - a.streams)[0] ?? pick.popularity;
    if (popularity) popularity = { ...popularity, title: pick.title };
    if (!popularity) {
      const same = ratings.popularity
        .filter(
          (p) =>
            normalizeTitle(p.title) === key &&
            p.artistId !== artist.artistId &&
            (release.sourceUrl
              .split("/")[5]
              ?.replaceAll("_", "-")
              .includes(p.artistId) ||
              normalizeTitle(apple?.artist ?? "").includes(
                normalizeTitle(
                  catalog.artists.find((a) => a.id === p.artistId)?.name ??
                    "__unknown__",
                ),
              )),
        )
        .sort((a, b) => b.streams - a.streams)[0];
      if (same) {
        const values = ratings.popularity
          .filter((p) => p.artistId === artist.artistId)
          .map((p) => p.streams)
          .filter((n) => n > 0);
        if (values.length) {
          const min = Math.min(...values),
            max = Math.max(...values);
          popularity = {
            ...same,
            artistId: artist.artistId,
            title: pick.title,
            scaleArtistId: artist.artistId,
            popularity:
              Math.round(
                10000 *
                  Math.max(
                    0,
                    Math.min(
                      1,
                      (Math.log1p(same.streams) - Math.log1p(min)) /
                        (Math.log1p(max) - Math.log1p(min)),
                    ),
                  ),
              ) / 100,
          };
        }
      }
    }
    tracks.push({
      title: pick.title,
      year:
        Number(String(release.year).match(/\d{4}/)?.[0]) ||
        new Date(apple?.releaseDate ?? "2000").getFullYear(),
      sourceUrl: release.sourceUrl,
      quality: { ...quality, artistId: artist.artistId, title: pick.title },
      ...(popularity ? { popularity } : {}),
      ...(apple ? { apple } : {}),
    });
    decisions.push({
      title: pick.title,
      status: apple
        ? "selected-apple-and-rym"
        : "selected-rym-original-release",
      sourceUrl: release.sourceUrl,
      ratingCount: release.ratingCount,
    });
  }
  if (tracks.length > 7) throw Error(artist.artistId + " exceeds seven");
  if (tracks.length) manifest[artist.artistId] = tracks;
  audit.push({ ...artist, decisions });
}
await fs.writeFile(
  "scripts/reviewed-singles.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await fs.writeFile(
  "docs/SINGLES_AUDIT.json",
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      method:
        "Complete RYM artist Singles sections; >50 ratings; max 7 significant original non-album recordings. Existing album editions, remixes and guest-only credits excluded. Release-level scores are labeled explicitly. Public Spotify streams reused when available; missing streams remain estimated.",
      artists: audit.map(({ decisions, ...a }) => ({ ...a, decisions })),
    },
    null,
    2,
  ) + "\n",
);
console.log({
  artistsReviewed: audit.length,
  artistsWithSingles: Object.keys(manifest).length,
  tracks: Object.values(manifest).flat().length,
  withApple: Object.values(manifest)
    .flat()
    .filter((t) => t.apple).length,
  withStreams: Object.values(manifest)
    .flat()
    .filter((t) => t.popularity).length,
});
