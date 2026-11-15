import { validateDefinition } from "./engine";
import type { Definition, SourceOverride } from "./types";

const prefix = "#bracket=v1.";
const maxLinkPayload = 64_000;
const maxSnapshotBytes = 8_000_000;

export function challengeSnapshot(
  definition: Definition,
  overrides: Record<string, SourceOverride>,
): Definition {
  return {
    version: 1,
    id: definition.id,
    createdAt: definition.createdAt,
    artist: definition.artist,
    artists: definition.artists,
    options: definition.options,
    roundSizes: definition.roundSizes,
    matches: definition.matches,
    albums: definition.albums.map(
      ({ id, title, artistIds, year, cover, credit }) => ({
        id,
        title,
        artistIds,
        year,
        cover,
        credit,
      }),
    ),
    songs: definition.songs.map((song) => ({
      id: song.id,
      title: song.title,
      artistIds: song.artistIds,
      albumIds: song.albumIds,
      albumId: song.albumId,
      kind: song.kind,
      quality: song.quality,
      popularity: song.popularity,
      scoreSource: "Shared bracket",
      duration: song.duration,
      youtubeId: overrides[song.id]?.primary || song.youtubeId,
      backupYoutubeId: overrides[song.id]?.backup || song.backupYoutubeId,
    })),
    sharedSources: Object.fromEntries(
      definition.songs
        .filter((song) => typeof overrides[song.id]?.start === "number")
        .map((song) => [song.id, { start: overrides[song.id].start }]),
    ),
  };
}

export function isChallengeLink(hash: string) {
  return hash.startsWith("#bracket=");
}

export async function createChallengeLink(
  definition: Definition,
  base: string,
) {
  const data = JSON.stringify(definition);
  const compressed = new Blob([data])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const payload = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (payload.length > maxLinkPayload) {
    throw Error(
      "This bracket is too large for a link. Send the challenge file instead.",
    );
  }
  const url = new URL(base);
  url.hash = prefix + payload;
  return url.href;
}

export async function readChallengeLink(hash: string) {
  const payload = hash.slice(prefix.length);
  if (
    !hash.startsWith(prefix) ||
    !/^[\w-]+$/.test(payload) ||
    payload.length > maxLinkPayload
  )
    throw Error("This challenge link is invalid or incomplete.");
  const bytes = Uint8Array.from(
    atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let json = "";
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxSnapshotBytes) {
        await reader.cancel();
        throw Error("This challenge is too large.");
      }
      json += decoder.decode(value, { stream: true });
    }
    return validateDefinition(JSON.parse(json + decoder.decode()));
  } finally {
    reader.releaseLock();
  }
}
