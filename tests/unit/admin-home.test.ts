import { describe, expect, it } from "vitest";
import {
  activityLine,
  ageLabel,
  collapseActivity,
  daysOld,
  integrationDetail,
  integrationHealth,
  localMidnight,
  needsHeadApproval,
  oldestContext,
  parseArTab,
  providerLabel,
  requestChip,
  weekStartInZone,
  whenLabel,
  type ActivityRow,
  type IntegrationRow,
} from "@/lib/admin-home";

// UX11 — Super Admin › Admin home, the pure part.
const TZ = "Africa/Nairobi"; // UTC+3, no DST
const WED = new Date("2026-11-11T06:00:00Z"); // Wed 11 Nov, 09:00 Nairobi

describe("access-request tabs, ages and chips", () => {
  it("parses the tab, falling back to Waiting", () => {
    expect(parseArTab("reviewed")).toBe("reviewed");
    expect(parseArTab("dismissed")).toBe("dismissed");
    expect(parseArTab("bogus")).toBe("waiting");
    expect(parseArTab(null)).toBe("waiting");
  });

  it("counts tenant-local days, not 24-hour blocks", () => {
    // 22:30 UTC on the 10th is 01:30 on the 11th in Nairobi — same day as WED.
    expect(daysOld("2026-11-10T22:30:00Z", WED, TZ)).toBe(0);
    expect(daysOld("2026-11-10T20:00:00Z", WED, TZ)).toBe(1);
    expect(daysOld("2026-11-01T06:00:00Z", WED, TZ)).toBe(10);
    expect(daysOld("2026-11-20T06:00:00Z", WED, TZ)).toBe(0); // never negative
  });

  it("labels ages and the oldest-waiting context", () => {
    expect(ageLabel(0)).toBe("Today");
    expect(ageLabel(1)).toBe("1 day");
    expect(ageLabel(6)).toBe("6 days");
    expect(oldestContext(null, WED, TZ)).toBe("None waiting");
    expect(oldestContext("2026-11-11T05:00:00Z", WED, TZ)).toBe("Oldest: today");
    expect(oldestContext("2026-11-10T06:00:00Z", WED, TZ)).toBe("Oldest: 1 day");
    expect(oldestContext("2026-11-07T06:00:00Z", WED, TZ)).toBe("Oldest: 4 days");
  });

  it("colours a waiting request by age; reviewed and dismissed are calm", () => {
    expect(requestChip("NEW", 0)).toEqual({ label: "Waiting", tone: "info" });
    expect(requestChip("NEW", 2)).toEqual({ label: "Waiting", tone: "warn" });
    expect(requestChip("NEW", 5)).toEqual({ label: "Waiting", tone: "bad" });
    expect(requestChip("REVIEWED", 9)).toEqual({ label: "Reviewed", tone: "ok" });
    expect(requestChip("DISMISSED", 9)).toEqual({ label: "Dismissed", tone: "muted" });
  });

  it("flags the roles that would need a Head's approval (not built yet)", () => {
    expect(needsHeadApproval("ProjectManager")).toBe(true);
    expect(needsHeadApproval("HeadOfProjects")).toBe(true);
    expect(needsHeadApproval("Member")).toBe(false);
    expect(needsHeadApproval("Executive")).toBe(false);
  });
});

describe("tenant-local week start", () => {
  it("is Monday 00:00 in the tenant's zone", () => {
    // Monday 9 Nov 00:00 Nairobi = Sunday 8 Nov 21:00 UTC.
    expect(weekStartInZone(WED, TZ).toISOString()).toBe("2026-11-08T21:00:00.000Z");
  });

  it("uses the tenant's day: Sunday 22:30 UTC is already Monday in Nairobi", () => {
    const sundayUtcLate = new Date("2026-11-15T22:30:00Z"); // Mon 16 Nov, 01:30 Nairobi
    expect(weekStartInZone(sundayUtcLate, TZ).toISOString()).toBe("2026-11-15T21:00:00.000Z");
  });

  it("handles a zone with DST", () => {
    // London is on GMT in November.
    expect(weekStartInZone(WED, "Europe/London").toISOString()).toBe("2026-11-09T00:00:00.000Z");
    // and on BST in July: Monday 6 Jul 00:00 BST = Sunday 5 Jul 23:00 UTC.
    expect(weekStartInZone(new Date("2026-07-08T12:00:00Z"), "Europe/London").toISOString()).toBe("2026-07-05T23:00:00.000Z");
    expect(localMidnight("2026-07-06", "Europe/London").toISOString()).toBe("2026-07-05T23:00:00.000Z");
  });

  it("shows a time for today, a day and time otherwise", () => {
    expect(whenLabel("2026-11-11T05:40:00Z", WED, TZ)).toBe("08:40");
    expect(whenLabel("2026-11-09T05:40:00Z", WED, TZ)).toBe("9 Nov, 08:40");
  });
});

describe("integration health", () => {
  const base: IntegrationRow = { provider: "youtrack", tenantStatus: "connected", tenantError: null, projects: 9, failingProjects: 0, lastRunAt: "2026-11-11T05:40:00Z", enabled: true };

  it("is Healthy when the last run went through", () => {
    expect(integrationHealth(base)).toEqual({ label: "Healthy", tone: "ok" });
    expect(integrationDetail(base, WED, TZ)).toBe("last run 08:40 · 9 projects");
    expect(providerLabel("youtrack")).toBe("YouTrack sync");
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("jira")).toBe("Jira");
  });

  it("is Failing when the connection errors or a project's sync failed", () => {
    expect(integrationHealth({ ...base, failingProjects: 2 }).label).toBe("Failing");
    expect(integrationDetail({ ...base, failingProjects: 2 }, WED, TZ)).toBe("last run 08:40 · 2 of 9 projects failing");
    expect(integrationHealth({ ...base, tenantStatus: "error" }).label).toBe("Failing");
    expect(integrationDetail({ ...base, tenantStatus: "error" }, WED, TZ)).toBe("last run 08:40 · connection error");
  });

  it("says when it hasn't run yet or the sync is switched off", () => {
    expect(integrationHealth({ ...base, lastRunAt: null })).toEqual({ label: "Not run yet", tone: "muted" });
    expect(integrationDetail({ ...base, lastRunAt: null, projects: 0 }, WED, TZ)).toBe("no sync yet");
    expect(integrationHealth({ ...base, enabled: false }).label).toBe("Off");
  });
});

describe("admin activity", () => {
  const row = (over: Partial<ActivityRow>): ActivityRow => ({
    id: "a",
    action: "update",
    entityType: "user",
    entityId: "u1",
    actorId: "admin",
    before: null,
    after: null,
    createdAt: "2026-11-11T05:00:00Z",
    actorName: "user_001",
    targetName: "user_014",
    ...over,
  });

  it("says each admin action in plain words", () => {
    expect(activityLine(row({ action: "role_grant", after: { role: "ProjectManager" } }))).toBe("Granted Project Manager to user_014");
    expect(activityLine(row({ action: "role_revoke", before: { role: "HeadOfProjects" } }))).toBe("Removed Head from user_014");
    expect(activityLine(row({ action: "role_grant", after: { role: "CustomAuditor" } }))).toBe("Granted CustomAuditor to user_014");
    expect(activityLine(row({ action: "update", after: { mfa_reset: true } }))).toBe("Reset MFA for user_014");
    expect(activityLine(row({ action: "update", before: { status: "ACTIVE" }, after: { status: "SUSPENDED" } }))).toBe("Suspended user_014");
    expect(activityLine(row({ action: "update", after: { status: "ACTIVE" } }))).toBe("Reactivated user_014");
    expect(activityLine(row({ action: "create" }))).toBe("Created the account for user_014");
    expect(activityLine(row({ action: "delete", targetName: null }))).toBe("Removed the account for a user");
    expect(activityLine(row({ action: "view_switch", after: { viewRole: "HeadOfQA" } }))).toBe("Switched “Viewing as” to Head of QA");
  });

  it("tells a granted access request from a dismissed one", () => {
    const ar = { entityType: "access_request", entityId: "r1", targetName: "user_020" };
    expect(activityLine(row({ ...ar, action: "access_request_review", after: { status: "REVIEWED", userId: "u9" } }))).toBe("Granted the access request from user_020");
    expect(activityLine(row({ ...ar, action: "access_request_review", after: { status: "REVIEWED" } }))).toBe("Reviewed the access request from user_020");
    expect(activityLine(row({ ...ar, action: "access_request_review", after: { status: "DISMISSED", reason: "x" }, targetName: null }))).toBe("Dismissed the access request");
  });

  it("folds a creation's role grant into the creation, newest first, five at most", () => {
    const rows: ActivityRow[] = [
      row({ id: "g1", action: "role_grant", entityId: "u9", after: { role: "Member" }, createdAt: "2026-11-11T05:00:00.100Z" }),
      row({ id: "c1", action: "create", entityId: "u9", createdAt: "2026-11-11T05:00:00.200Z" }),
      // A later grant to the same person is a real change — kept.
      row({ id: "g2", action: "role_grant", entityId: "u9", after: { role: "ProjectManager" }, createdAt: "2026-11-11T06:00:00Z" }),
      ...Array.from({ length: 6 }, (_, i) => row({ id: `v${i}`, action: "view_switch", entityId: "admin", after: { viewRole: "Member" }, createdAt: `2026-11-10T0${i}:00:00Z` })),
    ];
    const out = collapseActivity(rows, 5);
    expect(out.map((r) => r.id)).toEqual(["g2", "c1", "v5", "v4", "v3"]);
    expect(out.some((r) => r.id === "g1")).toBe(false);
  });
});
