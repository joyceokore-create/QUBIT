/**
 * Read a multipart request body with a hard byte cap. `req.formData()` buffers the whole
 * body before anything can check a file's size, so an oversized (or endless, chunked)
 * upload would be held in memory first. This refuses on a declared Content-Length over
 * the cap, then streams the body and stops reading the moment the cap is passed.
 */

export class BodyTooLargeError extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "BodyTooLargeError";
  }
}

/** Multipart framing (boundaries, part headers, small fields) on top of the file itself. */
export const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

/** The body as FormData, or null when it isn't valid multipart. Throws BodyTooLargeError. */
export async function readFormDataCapped(req: Request, maxBytes: number): Promise<FormData | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  const contentType = req.headers.get("content-type") ?? "";
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    return null;
  }
}
