// @vitest-environment node
// Milestone D — the renderer itself. Needs a Chromium (the ms-playwright cache locally, the
// Alpine package in the image); CI's gates job has neither, so the suite reports skipped
// there rather than failing. Pins the magic bytes and that a render actually produced pages.
import { describe, expect, it } from "vitest";
import { pdfAvailable, renderPdf } from "@/server/pdf/render";

const available = await pdfAvailable();

describe.skipIf(!available)("renderPdf (needs Chromium)", () => {
  it("renders a tiny document to a Letter-landscape PDF", { timeout: 60_000 }, async () => {
    const pdf = await renderPdf("<html><body><p>hi</p></body></html>", { landscape: true });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });
});

describe("pdfAvailable", () => {
  it("answers without throwing whether or not a browser exists", async () => {
    expect(typeof (await pdfAvailable())).toBe("boolean");
  });
});
