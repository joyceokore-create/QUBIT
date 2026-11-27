// @vitest-environment node
// Summary delivery: the Teams webhook allow-list (no SSRF), the roll-up card (summary and
// status spread only — no PM names), and the roll-up PowerPoint deck.
import { describe, expect, it } from "vitest";
import { isTeamsWebhookUrl, rollupCard } from "@/server/integrations/teams";
import { buildDigestDeck } from "@/server/pptx/digest-deck";
import { readZip } from "@/lib/zip-read";
import type { DigestReportData } from "@/server/pdf/report-data";

describe("isTeamsWebhookUrl", () => {
  it("accepts https webhooks on Microsoft's hosts", () => {
    expect(isTeamsWebhookUrl("https://contoso.webhook.office.com/webhookb2/abc@def/IncomingWebhook/123/456")).toBe(true);
    expect(isTeamsWebhookUrl("https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x")).toBe(true);
    expect(isTeamsWebhookUrl("https://default123.07.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc")).toBe(true);
  });
  it("refuses anything else", () => {
    for (const u of [
      "http://contoso.webhook.office.com/x",
      "https://webhook.office.com.evil.example/x",
      "https://evil.example/?u=contoso.webhook.office.com",
      "https://user:pw@contoso.webhook.office.com/x",
      "https://contoso.webhook.office.com:8443/x",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ])
      expect(isTeamsWebhookUrl(u), u).toBe(false);
  });
});

describe("rollupCard", () => {
  it("carries the week, the spread, the Head's summary lines and a link — nothing else", () => {
    const card = rollupCard({ isoWeek: "2026-W41", tenantName: "Riverbank", narrative: "Week 41: steady.\n\nNeeds attention: SUM-R is red.", rags: ["Green", "Green", "Amber", "Red"], approvedBy: "Head One", link: "https://q.example.invalid/reports?week=2026-W41" });
    const text = JSON.stringify(card);
    expect(card.type).toBe("AdaptiveCard");
    expect(text).toContain("Riverbank portfolio · Week 41");
    expect(text).toContain("4 projects · 2 on track · 1 at risk · 1 off track");
    expect(text).toContain("Needs attention: SUM-R is red.");
    expect(text).toContain("https://q.example.invalid/reports?week=2026-W41");
  });
});

describe("buildDigestDeck", () => {
  const row = (i: number, rag: "Green" | "Amber" | "Red") => ({ projectId: `p${i}`, code: `P-${i}`, name: `Project ${i}`, pmName: "PM Person", rag, checkIn: "Confirmed" as const, submittedToHead: true, narrative: `Line ${i}`, stage: "", marketSummary: null });
  const data = {
    tenantName: "Riverbank",
    brandColor: "#ED1C24",
    week: { isoWeek: "2026-W41", number: "41", range: "5–11 Oct", isCurrent: false, generatedAt: new Date("2026-10-12T10:00:00Z") },
    status: "Approved",
    narrative: "Week 41: steady.\nNeeds attention: P-2 is red.",
    approvedByName: "Head One",
    approvedAt: new Date("2026-10-10T10:00:00Z"),
    total: 14,
    counts: { green: 12, amber: 1, red: 1, computed: 0 },
    groups: [
      { portfolioName: "Digital", rows: Array.from({ length: 13 }, (_, i) => row(i, i === 2 ? "Red" : i === 3 ? "Amber" : "Green")) },
      { portfolioName: "Core", rows: [row(99, "Green")] },
    ],
  } as unknown as DigestReportData;

  it("builds a deck: title, summary, then the projects 12 to a slide per portfolio", async () => {
    const buf = await buildDigestDeck(data, { timeZone: "Africa/Nairobi" });
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const zip = readZip(buf);
    const slides = [...zip.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slides).toHaveLength(5); // title + summary + Digital (2 slides) + Core
    const all = slides.map((n) => zip.get(n)!.read().toString("utf8")).join("\n");
    expect(all).toContain("Portfolio roll-up");
    expect(all).toContain("Needs attention: P-2 is red.");
    expect(all).toContain("Digital (1 of 2)");
    expect(all).toContain("Off track");
  });
});
