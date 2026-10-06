import "server-only";
import { access, constants } from "node:fs/promises";

/**
 * Milestone D — HTML → PDF through headless Chromium (DECISIONS: M9-B resolved; Chromium
 * ships in the production image, playwright-core drives it). Two rules shape this module:
 *
 *  1. **Data first, render after.** The caller fetches everything under RLS, builds a
 *     self-contained HTML string, THEN calls renderPdf — never inside withTenant (5 s
 *     interactive-transaction timeout).
 *  2. **Nothing external ever loads.** Every request the page makes is aborted; templates
 *     carry inline styles, system fonts and an inline SVG logo, so a template can't reach
 *     the network even by mistake.
 *
 * One Chromium at a time: launches are serialised through a promise queue, so a burst of
 * exports queues instead of forking N browsers (~150 MB RSS each) on the box. Launch per
 * request + `finally close()` means a crash can never leak a browser process.
 */

export interface RenderPdfOptions {
  landscape?: boolean;
  format?: "Letter" | "A4";
  /** Chromium footer: a separate document — inline styles, explicit font-size, no external refs. */
  footerTemplate?: string;
  /** Required with footerTemplate: Chromium draws header/footer inside these margins, so they
   * must match the template's @page margins or the footer lands under the content. */
  margin?: { top: string; right: string; bottom: string; left: string };
}

// Alpine's `chromium` package installs both; PDF_CHROMIUM_PATH wins when set (Dockerfile).
const KNOWN_PATHS = ["/usr/bin/chromium", "/usr/bin/chromium-browser"];
const ZERO = { top: "0", right: "0", bottom: "0", left: "0" };

const executable = (p: string) => access(p, constants.X_OK).then(() => true, () => false);

let resolved: Promise<string | null> | undefined;

async function resolveExecutable(): Promise<string | null> {
  for (const p of [process.env.PDF_CHROMIUM_PATH, ...KNOWN_PATHS]) {
    if (p && (await executable(p))) return p;
  }
  try {
    // Local dev: the browser @playwright/test installed into the ms-playwright cache.
    const { chromium } = await import("playwright-core");
    const p = chromium.executablePath();
    if (p && (await executable(p))) return p;
  } catch {
    // playwright-core missing or no browser cache → unavailable, never an error.
  }
  return null;
}

/** True when a Chromium can be launched here. Resolves a path and checks it is executable —
 * never launches — and is memoised for the life of the process. */
export function pdfAvailable(): Promise<boolean> {
  return (resolved ??= resolveExecutable()).then((p) => p !== null);
}

let queue: Promise<unknown> = Promise.resolve();

/** Render a self-contained HTML document to a PDF buffer. Throws when no browser is available
 * (callers check pdfAvailable() first and answer 503) or the render fails. */
export function renderPdf(html: string, opts: RenderPdfOptions = {}): Promise<Buffer> {
  const run = queue.then(() => doRender(html, opts));
  queue = run.catch(() => undefined);
  return run;
}

async function doRender(html: string, opts: RenderPdfOptions): Promise<Buffer> {
  const executablePath = await (resolved ??= resolveExecutable());
  if (!executablePath) throw new Error("PDF rendering unavailable: no Chromium executable.");
  const { chromium } = await import("playwright-core");
  // Playwright already passes --headless, --no-sandbox (chromiumSandbox defaults off — the
  // Alpine package has no SUID helper and uid 1001 can't unshare namespaces under Docker's
  // seccomp) and --disable-dev-shm-usage (Docker's 64 MB /dev/shm). --disable-gpu is the only
  // extra a headless box needs.
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"], timeout: 15_000 });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load", timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: opts.format ?? "Letter",
      landscape: opts.landscape ?? false,
      printBackground: true,
      preferCSSPageSize: true,
      margin: opts.margin ?? ZERO,
      displayHeaderFooter: Boolean(opts.footerTemplate),
      // Without an explicit (empty) header Chromium prints its default date/title line.
      headerTemplate: "<span></span>",
      footerTemplate: opts.footerTemplate,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
