// Email templates (docs/16 §8). Two properties matter enough to pin: the tenant's brand
// colour reaches the markup (the fixture tenant green, Riverbank red — docs/08's per-tenant rule holds
// in email too), and user-supplied text is escaped, because a notification message can
// contain anything somebody typed into a task title.
import { describe, expect, it } from "vitest";
import { digestEmail, weeklyReportEmail } from "@/server/mail/template";

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
