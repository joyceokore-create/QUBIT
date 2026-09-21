/**
 * Post-login redirect targets must stay on this origin.
 *
 * A prefix check alone is not enough: WHATWG URL parsing treats "\" as "/" for
 * special schemes and strips ASCII tab/newline anywhere in the input, so
 * "/\evil.com" — and "/%09\evil.com" — resolve protocol-relative to
 * https://evil.com/ when the router hands them to `new URL(href, location.href)`.
 * So canonicalize the same way the browser will, require the result to stay on
 * the (dummy) base origin, and return the re-serialized path.
 */
export function sanitizeCallbackUrl(raw: string | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  const base = "https://q.invalid";
  try {
    const resolved = new URL(raw, base);
    if (resolved.origin !== base) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
