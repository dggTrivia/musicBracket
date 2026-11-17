import {
  challengeSnapshot,
  createPortableChallengeLink,
  readChallengeLink,
  shareCodePattern,
} from "../src/share";

interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface ShareEnvironment {
  BRACKETS: { prepare(sql: string): Statement };
}

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers });

export async function createBracket(request: Request, env: ShareEnvironment) {
  if (request.method !== "POST")
    return error("Use POST to create a bracket link.", 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return error("Create your link from MusicBracket.", 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return error("Send a bracket as JSON.", 415);
  if (!env.BRACKETS)
    return error("Sharing is temporarily unavailable. Please try again.", 503);

  let payload: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) return error("The bracket is missing.", 400);
    let body = "";
    let size = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 66000) {
          await reader.cancel();
          return error("This bracket is too large to share.", 413);
        }
        body += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    const input = JSON.parse(body + decoder.decode());
    if (
      typeof input.payload !== "string" ||
      !input.payload.startsWith("#bracket=v1.")
    )
      return error("The bracket is invalid.", 400);
    const definition = await readChallengeLink(input.payload);
    // Persist only the replay definition, so picks and extra imported fields are excluded.
    const url = await createPortableChallengeLink(
      challengeSnapshot(definition, definition.sharedSources ?? {}),
      request.url,
    );
    payload = new URL(url).hash;
  } catch {
    return error("The bracket is invalid or incomplete.", 400);
  }

  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)),
    );
    const id = btoa(String.fromCharCode(...digest.slice(0, 12)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const existing = await env.BRACKETS.prepare(
      "SELECT payload FROM shared_brackets WHERE id = ?",
    )
      .bind(id)
      .first<{ payload: string }>();
    if (existing) {
      if (existing.payload !== payload)
        return error("Please try sharing this bracket again.", 409);
      return Response.json({ id }, { headers });
    }
    // A bounded, atomic insert limits anonymous writes and reuses identical snapshots.
    const result = await env.BRACKETS.prepare(
      `INSERT INTO shared_brackets (id, payload, created_at)
      SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM shared_brackets WHERE created_at >= ?) < 500
      ON CONFLICT(id) DO NOTHING`,
    )
      .bind(id, payload, Date.now(), Date.now() - 86400000)
      .run();
    if (!result.meta.changes) {
      const saved = await env.BRACKETS.prepare(
        "SELECT payload FROM shared_brackets WHERE id = ?",
      )
        .bind(id)
        .first<{ payload: string }>();
      if (saved?.payload !== payload)
        return error(
          "The daily sharing limit has been reached. Please try again tomorrow.",
          429,
        );
    }
    return Response.json({ id }, { status: 201, headers });
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "bracket_share_failed",
        message: cause instanceof Error ? cause.message : "Database error",
      }),
    );
    return error("The bracket link could not be saved. Please try again.", 503);
  }
}

export async function loadBracket(
  request: Request,
  env: ShareEnvironment,
  id: string,
) {
  if (request.method !== "GET") return error("Use GET to open a bracket.", 405);
  if (!shareCodePattern.test(id))
    return error("This bracket link is invalid or incomplete.", 400);
  if (!env.BRACKETS)
    return error("Sharing is temporarily unavailable. Please try again.", 503);
  try {
    const edgeCache =
      typeof caches === "undefined"
        ? undefined
        : (caches as CacheStorage & { default?: Cache }).default;
    const cached = await edgeCache?.match(request);
    if (cached) return cached;
    const saved = await env.BRACKETS.prepare(
      "SELECT payload FROM shared_brackets WHERE id = ?",
    )
      .bind(id)
      .first<{ payload: string }>();
    if (!saved)
      return error(
        "This shared bracket could not be found. Check the link with your friend.",
        404,
      );
    const response = Response.json(saved, {
      headers: {
        ...headers,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    await edgeCache?.put(request, response.clone());
    return response;
  } catch {
    return error(
      "This shared bracket could not be loaded. Please try again.",
      503,
    );
  }
}
