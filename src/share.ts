import { validateDefinition } from "./engine";
import type { Definition, SourceOverride } from "./types";

const prefix = "#bracket=v1.";
const shortPrefix = "#b=";
export const shareCodePattern = /^[A-Za-z0-9_-]{16}$/;
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
  return hash.startsWith("#bracket=") || hash.startsWith(shortPrefix);
}

export async function createChallengeLink(
  definition: Definition,
  base: string,
) {
  const url = new URL(base);
  const portable = await createPortableChallengeLink(definition, base);
  if (/^(localhost|127(?:\.\d+){3}|\[::1\])$|\.localhost$/i.test(url.hostname))
    return portable;
  const response = await fetch(new URL("/api/brackets", url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: new URL(portable).hash }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !shareCodePattern.test(data.id))
    throw Error(
      data.error || "The bracket link could not be created. Please try again.",
    );
  url.search = "";
  url.hash = shortPrefix + data.id;
  return url.href;
}

export async function createPortableChallengeLink(
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
    throw Error("This bracket is too large to share. Try a smaller bracket.");
  }
  const url = new URL(base);
  url.hash = prefix + payload;
  return url.href;
}

export async function readChallengeLink(hash: string) {
  if (hash.startsWith(shortPrefix)) {
    const id = hash.slice(shortPrefix.length);
    if (!shareCodePattern.test(id))
      throw Error("This bracket link is invalid or incomplete.");
    const response = await fetch(`/api/brackets/${id}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(
        data.error ||
          "This shared bracket could not be loaded. Please try again.",
      );
    if (typeof data.payload !== "string" || !data.payload.startsWith(prefix))
      throw Error("This shared bracket is invalid.");
    return readChallengeLink(data.payload);
  }
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
