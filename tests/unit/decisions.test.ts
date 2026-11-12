// WS2 (UX fidelity Tier 4) — the pure Decisions rules: who may decide / act, the inputs'
// required notes, due-date buckets and chips (tenant-local days), and the row wording.
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildOptions,
  canCompleteGlcAction,
  canCreateGlcAction,
  canDecide,
  DecideInput,
  dueBucket,
  dueChip,
  dueFilterDays,
  dueMeta,
  glcChip,
  isHead,
  outcomeChip,
  parseDecisionTab,
  RaiseInput,
  raisedByFull,
  raisedByLine,
  readOptions,
  registerTitle,
  weekStart,
} from "@/lib/decisions";

const TZ = "Africa/Nairobi";
// Thursday 12 Nov 2026, 10:00 in Nairobi.
const NOW = new Date("2026-11-12T07:00:00Z");

describe("who may do what", () => {
  it("only Executives decide — not Heads, PMs or Super Admin", () => {
    expect(canDecide(["Executive"])).toBe(true);
    expect(canDecide(["HeadOfProjects"])).toBe(false);
    expect(canDecide(["HeadOfQA"])).toBe(false);
    expect(canDecide(["ProjectManager"])).toBe(false);
    expect(canDecide(["PlatformSuperAdmin"])).toBe(false);
  });

  it("Heads are Head and Head of QA", () => {
    expect(isHead(["HeadOfProjects"])).toBe(true);
    expect(isHead(["HeadOfQA"])).toBe(true);
    expect(isHead(["Executive", "ProjectManager"])).toBe(false);
  });

  it("GLC actions: Executives and Heads create; owner, Executive or Head complete", () => {
    expect(canCreateGlcAction(["Executive"])).toBe(true);
    expect(canCreateGlcAction(["HeadOfProjects"])).toBe(true);
    expect(canCreateGlcAction(["ProjectManager"])).toBe(false);
    expect(canCompleteGlcAction(["Member"], "u1", "u1")).toBe(true);
    expect(canCompleteGlcAction(["Member"], "u1", "u2")).toBe(false);
    expect(canCompleteGlcAction(["Member"], "u1", null)).toBe(false);
    expect(canCompleteGlcAction(["Executive"], "u1", "u2")).toBe(true);
  });
});

describe("inputs", () => {
  it("declined and deferred need a note; approve does not; defer needs a date", () => {
    expect(DecideInput.safeParse({ action: "approve" }).success).toBe(true);
    expect(DecideInput.safeParse({ action: "decline" }).success).toBe(false);
    expect(DecideInput.safeParse({ action: "decline", note: "  " }).success).toBe(false);
    expect(DecideInput.safeParse({ action: "decline", note: "Out of budget" }).success).toBe(true);
    expect(DecideInput.safeParse({ action: "defer", note: "Wait for the vendor" }).success).toBe(false);
    expect(DecideInput.safeParse({ action: "defer", note: "Wait for the vendor", dueDate: "2026-11-20" }).success).toBe(true);
    expect(DecideInput.safeParse({ action: "defer", note: "Wait", dueDate: "20 Nov" }).success).toBe(false);
    expect(DecideInput.safeParse({ action: "maybe" }).success).toBe(false);
  });

  it("a raise needs a title; ids must be id-shaped", () => {
    expect(RaiseInput.safeParse({ title: "ab" }).success).toBe(false);
    expect(RaiseInput.safeParse({ title: "Choose the card scheme", projectId: "x'; drop" }).success).toBe(false);
    expect(RaiseInput.safeParse({ title: "Choose the card scheme", projectId: "3f1c-0a" }).success).toBe(true);
  });

  it("options carry what happens if approved / declined, and bad JSON reads as none", () => {
    expect(buildOptions({ ifApproved: "Go-live stays", ifDeclined: undefined })).toEqual([{ label: "If approved", text: "Go-live stays" }]);
    expect(readOptions([{ label: "If declined", text: "Moves 3 weeks" }])).toHaveLength(1);
    expect(readOptions("nope")).toEqual([]);
    expect(readOptions([{ nope: 1 }])).toEqual([]);
  });

  it("an unknown tab reads as Waiting", () => {
    expect(parseDecisionTab("actions")).toBe("actions");
    expect(parseDecisionTab("drop table")).toBe("waiting");
    expect(parseDecisionTab(null)).toBe("waiting");
  });
});

describe("due dates (Mon–Sun weeks, tenant-local days)", () => {
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // Thu → Mon
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sun → Mon
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("buckets: overdue · this week (today counts) · next week · later", () => {
    expect(dueBucket("2026-11-11", "2026-11-12")).toBe("overdue");
    expect(dueBucket("2026-11-12", "2026-11-12")).toBe("this-week");
    expect(dueBucket("2026-11-15", "2026-11-12")).toBe("this-week");
    expect(dueBucket("2026-11-16", "2026-11-12")).toBe("next-week");
    expect(dueBucket("2026-11-22", "2026-11-12")).toBe("next-week");
    expect(dueBucket("2026-11-23", "2026-11-12")).toBe("later");
    expect(dueFilterDays("this-week", "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-15" });
    expect(dueFilterDays("overdue", "2026-11-12")).toEqual({ to: "2026-11-11" });
    expect(dueFilterDays("later", "2026-11-12")).toEqual({ from: "2026-11-23" });
  });

  it("chips and the date column read like the design", () => {
    expect(dueChip("2026-11-06T09:00:00Z", NOW, TZ)).toEqual({ tone: "bad", label: "Overdue" });
    expect(dueMeta("2026-11-06T09:00:00Z", NOW, TZ)).toBe("was 6 Nov");
    expect(dueChip("2026-11-13T09:00:00Z", NOW, TZ)).toEqual({ tone: "warn", label: "Due Fri" });
    expect(dueChip("2026-11-12T20:00:00Z", NOW, TZ)).toEqual({ tone: "warn", label: "Due today" });
    expect(dueChip("2026-11-18T09:00:00Z", NOW, TZ)).toEqual({ tone: "muted", label: "Next week" });
    expect(dueChip("2026-11-30T09:00:00Z", NOW, TZ)).toEqual({ tone: "muted", label: "Later" });
    expect(dueChip(null, NOW, TZ).label).toBe("No due date");
    expect(dueMeta("2026-11-13T09:00:00Z", NOW, TZ)).toBe("13 Nov");
  });

  it("a due instant late on the 11th UTC is already the 12th in Nairobi (not overdue)", () => {
    expect(dueChip("2026-11-11T22:30:00Z", NOW, TZ).label).toBe("Due today");
  });

  it("outcome and GLC chips", () => {
    expect(outcomeChip("approved")).toEqual({ tone: "ok", label: "Approved" });
    expect(outcomeChip("declined")).toEqual({ tone: "bad", label: "Declined" });
    expect(glcChip("done", "2026-11-01T00:00:00Z", NOW, TZ)).toEqual({ tone: "ok", label: "Done" });
    expect(glcChip("open", null, NOW, TZ)).toEqual({ tone: "muted", label: "Open" });
    expect(glcChip("open", "2026-11-01T09:00:00Z", NOW, TZ).label).toBe("Overdue");
  });
});

describe("wording", () => {
  it("raised by: the Head by role, a PM by name", () => {
    expect(raisedByLine({ name: "user_003", roles: ["HeadOfProjects"] })).toBe("raised by Head");
    expect(raisedByLine({ name: "user_004", roles: ["ProjectManager"] })).toBe("raised by PM user_004");
    expect(raisedByLine({ name: "user_001", roles: ["PlatformSuperAdmin"] })).toBe("raised by user_001");
    expect(raisedByFull({ name: "user_003", roles: ["HeadOfProjects"] })).toBe("raised by Head (user_003)");
  });

  it("the Register entry says the outcome first", () => {
    expect(registerTitle("approved", "Extra budget")).toBe("Approved: Extra budget");
    expect(registerTitle("declined", "Extra budget")).toBe("Declined: Extra budget");
  });
});
