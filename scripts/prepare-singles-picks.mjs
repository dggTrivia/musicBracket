import fs from "node:fs/promises";
import { normalizeTitle } from "./ratings-import.mjs";
import { singlesAuditPicks } from "./singles-audit-picks.mjs";
const catalog = JSON.parse(await fs.readFile("public/catalog.json", "utf8"));
const ratings = JSON.parse(await fs.readFile("public/ratings.json", "utf8"));
const output = [];
for (const artist of catalog.artists) {
  const page = JSON.parse(
    await fs.readFile(`tmp/artist-singles/${artist.id}.json`, "utf8"),
  );
  const decisions = [];
  for (const title of singlesAuditPicks[artist.id] ?? []) {
    const key = normalizeTitle(title);
    const existing = catalog.songs.find(
      (s) =>
        s.artistIds.includes(artist.id) &&
        normalizeTitle(s.title) === key &&
        s.albumIds.some((id) => !id.endsWith("-singles")),
    );
    if (existing) {
      decisions.push({
        title,
        status: "already-on-album",
        songId: existing.id,
      });
      continue;
    }
    const aliases = {
      "Cartoon & Cereal": "Cartoon + Cereal",
      "Got to Give It Up": "Got to Give It Up (Part 1 & 2)",
      "Lion King on Ice": "Lewis Street",
    };
    const evidenceKey = normalizeTitle(aliases[title] ?? title);
    const rows = page.rows.filter(
      (r) =>
        normalizeTitle(r.title.replace(/^"|"$/g, "")) === evidenceKey ||
        r.title
          .split(/\s+\/\s+/)
          .some((t) => normalizeTitle(t) === evidenceKey),
    );
    const evidence = rows
      .filter((r) => r.ratingCount > 50 && r.rating > 0)
      .sort((a, b) => b.ratingCount - a.ratingCount)[0];
    if (!evidence) {
      decisions.push({ title, status: "needs-release-match" });
      continue;
    }
    const measured = ratings.quality.find(
      (r) => r.artistId === artist.id && normalizeTitle(r.title) === key,
    );
    if (measured && measured.ratingCount <= 50) {
      decisions.push({
        title,
        status: "insufficient-song-ratings",
        songRatingCount: measured.ratingCount,
        release: evidence,
      });
      continue;
    }
    decisions.push({
      title,
      status: "approved-for-metadata-check",
      release: evidence,
      quality: measured ?? null,
      popularity:
        ratings.popularity.find(
          (r) => r.artistId === artist.id && normalizeTitle(r.title) === key,
        ) ?? null,
    });
  }
  output.push({
    artistId: artist.id,
    name: artist.name,
    url: page.url,
    retrievedAt: page.retrievedAt,
    releaseCount: page.rows.length,
    decisions,
    note: decisions.length
      ? "Original releases reviewed against album catalog; only selected significant recordings proceed."
      : "No major original non-album single selected; album aliases, guest appearances, remixes and minor B-sides excluded.",
  });
}
await fs.writeFile(
  "tmp/singles-audit/approved-picks.json",
  JSON.stringify(output, null, 2),
);
for (const a of output)
  for (const d of a.decisions)
    if (d.status !== "approved-for-metadata-check")
      console.log(`${a.artistId}: ${d.title}: ${d.status}`);
console.log(
  "Approved for metadata review:",
  output
    .flatMap((a) => a.decisions)
    .filter((d) => d.status === "approved-for-metadata-check").length,
);
