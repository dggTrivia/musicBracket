interface ImageStatement {
  bind(...values: (string | number)[]): ImageStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface ImageEnvironment {
  BRACKETS: {
    prepare(sql: string): ImageStatement;
    batch(statements: ImageStatement[]): Promise<unknown>;
  };
}

const chunkBytes = 192 * 1024;
const maxBytes = 8 * 1024 * 1024;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const error = (message: string, status: number) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

export async function createResultImage(
  request: Request,
  env: ImageEnvironment,
) {
  if (request.method !== "POST")
    return error("Use POST to share an image.", 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return error("Share your image from MusicBracket.", 403);
  if (request.headers.get("Content-Type") !== "image/png")
    return error("Send a PNG result image.", 415);
  if (!env.BRACKETS)
    return error("Image sharing is temporarily unavailable.", 503);

  const reader = request.body?.getReader();
  if (!reader) return error("The result image is missing.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return error(
          "This PNG is too large to share as a link. You can still download it.",
          413,
        );
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    if (!pngSignature.every((byte, i) => bytes[i] === byte))
      return error("The result image is not a PNG.", 400);

    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const id = Array.from(hash.slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const key = "image:" + id;
    const db = env.BRACKETS;
    const saved = () =>
      db
        .prepare("SELECT id FROM shared_brackets WHERE id = ?")
        .bind(key)
        .first();
    if (await saved()) return Response.json({ id });

    const now = Date.now();
    const writes = [
      db
        .prepare(
          `INSERT INTO shared_brackets (id, payload, created_at)
        SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM shared_brackets
        WHERE created_at >= ? AND length(id) = 38 AND id LIKE 'image:%') < 100
        ON CONFLICT(id) DO NOTHING`,
        )
        .bind(key, String(size), now, now - 86400000),
    ];
    // The manifest and chunks commit atomically on the existing D1 binding.
    for (let start = 0; start < size; start += chunkBytes) {
      const chunk = bytes.subarray(start, start + chunkBytes);
      let binary = "";
      for (const byte of chunk) binary += String.fromCharCode(byte);
      const chunkKey = key + ":" + String(start / chunkBytes).padStart(3, "0");
      writes.push(
        db
          .prepare(
            `INSERT INTO shared_brackets (id, payload, created_at)
        SELECT ?, ?, 0 WHERE EXISTS (SELECT 1 FROM shared_brackets WHERE id = ?)
        ON CONFLICT(id) DO NOTHING`,
          )
          .bind(chunkKey, btoa(binary), key),
      );
    }
    await db.batch(writes);
    return (await saved())
      ? Response.json({ id }, { status: 201 })
      : error(
          "The daily image sharing limit has been reached. Please try again tomorrow.",
          429,
        );
  } catch {
    return error("The image could not be shared. Please try again.", 503);
  } finally {
    reader.releaseLock();
  }
}

export async function loadResultImage(
  request: Request,
  env: ImageEnvironment,
  id: string,
) {
  if (request.method !== "GET")
    return error("Use GET to open a result image.", 405);
  if (!/^[a-f0-9]{32}$/.test(id))
    return error("Invalid result image link.", 400);
  if (!env.BRACKETS)
    return error("Image sharing is temporarily unavailable.", 503);
  try {
    const key = "image:" + id;
    const { results } = await env.BRACKETS.prepare(
      "SELECT payload FROM shared_brackets WHERE id >= ? AND id < ? ORDER BY id",
    )
      .bind(key, key + ";")
      .all<{ payload: string }>();
    if (!results.length)
      return error("This result image could not be found.", 404);
    const size = Number(results[0].payload);
    if (
      !Number.isInteger(size) ||
      size < pngSignature.length ||
      size > maxBytes
    )
      throw Error("Invalid stored image size");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const row of results.slice(1)) {
      const binary = atob(row.payload);
      for (let i = 0; i < binary.length; i++)
        bytes[offset++] = binary.charCodeAt(i);
    }
    if (offset !== size) throw Error("Incomplete stored image");
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": 'inline; filename="musicbracket-result.png"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return error(
      "This result image could not be loaded. Please try again.",
      503,
    );
  }
}
