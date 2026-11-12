// Email templates (docs/16 §8). Two properties matter enough to pin: the tenant's brand
// colour reaches the markup (the fixture tenant green, Riverbank red — docs/08's per-tenant rule holds
// in email too), and user-supplied text is escaped, because a notification message can
// contain anything somebody typed into a task title.
import { describe, expect, it } from "vitest";
import { digestEmail, nudgeEmail, projectReportEmail, rollupEmail, weeklyReportEmail } from "@/server/mail/template";

const base = { tenantName: "Demo Org B", brandColor: "#1B7A3E", appUrl: "https://q.example.invalid" };

describe("digestEmail", () => {
  it("batches every item into ONE email and links each one", () => {
    const mail = digestEmail({
      ...base,
      firstName: "Daniel",
      items: [
        { message: "Task assigned to you", link: "/projects/1?tab=Board" },
        { message: "Check-in unconfirmed", link: null },
      ],
    });
    expect(mail.subject).toBe("QUBIT: 2 updates for you");
    expect(mail.html).toContain("https://q.example.invalid/projects/1?tab=Board");
    expect(mail.html).toContain(base.brandColor); // tenant brand, not a hardcoded colour
    // The plain-text alternative carries the same content, not a "view in browser" stub.
    expect(mail.text).toContain("Task assigned to you");
    expect(mail.text).toContain("Check-in unconfirmed");
  });

  it("says 'update' in the singular for one item", () => {
    const mail = digestEmail({ ...base, firstName: "A", items: [{ message: "One thing", link: null }] });
    expect(mail.subject).toBe("QUBIT: 1 update for you");
  });

  it("escapes user-supplied text — a task title is not markup", () => {
    const mail = digestEmail({
      ...base,
      firstName: "Daniel",
      items: [{ message: `<img src=x onerror="alert(1)">`, link: null }],
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });
});

describe("weeklyReportEmail", () => {
  it("links to the report rather than copying it", () => {
    const mail = weeklyReportEmail({
      ...base,
      isoWeek: "2026-W31",
      confirmed: 3,
      projects: 5,
      url: "https://q.example.invalid/reports/s/tok",
    });
    expect(mail.subject).toContain("2026-W31");
    expect(mail.html).toContain("https://q.example.invalid/reports/s/tok");
    expect(mail.text).toContain("3 of 5 check-ins were confirmed");
    // The email is a pointer; the depth stays in the app.
    expect(mail.html).not.toContain("## Project check-ins");
  });
});

// Milestone A — the PM's nudge to a blocked task's assignee (who may not live in QUBIT).
describe("nudgeEmail", () => {
  const nudge = {
    ...base,
    recipientFirstName: "Contributor",
    nudgerName: "PM One",
    projectCode: "AGB",
    projectName: "Agent banking",
    taskKey: "AGB-12",
    taskTitle: "KYC API sandbox integration",
    externalKey: "YT-198",
    externalUrl: "https://yt.example.invalid/issue/YT-198",
    blockedDays: 9,
    blockerDescription: "Sandbox unavailable",
    taskLink: "/projects/p1?tab=Board&task=t1",
  };

  it("leads with the YouTrack issue when the task is mirrored, with QUBIT as the second door", () => {
    const mail = nudgeEmail(nudge);
    expect(mail.subject).toBe("QUBIT: AGB · YT-198 blocked 9 days — PM One needs a word");
    expect(mail.html).toContain("Open in YouTrack");
    expect(mail.html).toContain(nudge.externalUrl);
    expect(mail.html).toContain("https://q.example.invalid/projects/p1?tab=Board&amp;task=t1");
    expect(mail.html).toContain(base.brandColor);
    expect(mail.text).toContain("Blocked for 9 days: Sandbox unavailable");
    expect(mail.text).toContain(nudge.externalUrl);
  });

  it("falls back to the QUBIT board for a native task, and says 'day' in the singular", () => {
    const mail = nudgeEmail({ ...nudge, externalKey: null, externalUrl: null, blockedDays: 1 });
    expect(mail.subject).toContain("AGB-12 blocked 1 day —");
    expect(mail.html).toContain("Open in QUBIT");
    expect(mail.html).not.toContain("Open in YouTrack");
  });

  it("escapes the blocker text and title — somebody typed those", () => {
    const mail = nudgeEmail({ ...nudge, taskTitle: `<script>alert(1)</script>`, blockerDescription: `<img src=x>` });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("rollupEmail (Milestone D)", () => {
  const mail = rollupEmail({
    ...base,
    isoWeek: "2026-W41",
    range: "5–9 Oct",
    narrative: "Nine of thirteen <green>",
    counts: { green: 9, amber: 3, red: 1 },
    total: 13,
    preparedBy: "Head One",
    url: "https://q.example.invalid/reports?week=2026-W41",
  });

  it("carries the Head's line, the spread and the link, in the tenant's colour, escaped", () => {
    expect(mail.subject).toBe("Week 41 roll-up — Demo Org B");
    expect(mail.html).toContain("Nine of thirteen &lt;green&gt;");
    expect(mail.html).toContain("13 projects · 9 green · 3 amber · 1 red");
    expect(mail.html).toContain(base.brandColor);
    expect(mail.html).toContain("https://q.example.invalid/reports?week=2026-W41");
    expect(mail.text).toContain("Prepared by Head One.");
    expect(mail.text).toContain("attached as a PDF");
  });
});

describe("projectReportEmail (Milestone D)", () => {
  it("names the sender, the project and the week", () => {
    const mail = projectReportEmail({ ...base, isoWeek: "2026-W41", projectCode: "ATLAS", projectName: "Atlas <migration>", senderName: "Head One", url: "https://q.example.invalid/projects/p1" });
    expect(mail.subject).toBe("ATLAS status report · Week 41 — Demo Org B");
    expect(mail.html).toContain("Atlas &lt;migration&gt;");
    expect(mail.html).toContain("Head One shared");
    expect(mail.text).toContain("https://q.example.invalid/projects/p1");
  });
});
