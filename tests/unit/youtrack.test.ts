// M7-C YouTrack connector (BRD FR-INT-05). The field mapping is the part that differs per
// customer and is easiest to get wrong, so it is pure and tested directly — no network.
import { describe, expect, it } from "vitest";
import {
  isPrivateAddress,
  mapIssue,
  mapPriority,
  mapState,
  mapType,
  summarizeYoutrack,
  type YoutrackIssue,
} from "@/server/connectors/youtrack";
import { changedFields, parseConfig } from "@/server/connectors/youtrack-sync";
import { parseMapLines } from "@/components/workspace/integrations-grid";

const BASE = "https://acme.youtrack.cloud";

const issue = (over: Partial<YoutrackIssue> = {}): YoutrackIssue => ({
  id: "2-1043",
  idReadable: "RBC-17",
  summary: "Statement export truncates at 500 rows",
  description: "Repro: export a 900-row statement.",
  updated: Date.parse("2026-07-30T09:00:00Z"),
  customFields: [
    { name: "State", value: { name: "In Progress" } },
    { name: "Type", value: { name: "Bug" } },
    { name: "Priority", value: { name: "Major" } },
    { name: "Assignee", value: { login: "aokello", email: "user_001@example.invalid", fullName: "A Okello" } },
  ],
  ...over,
});

describe("state mapping", () => {
  it("maps the stock workflow onto QUBIT's five statuses", () => {
    expect(mapState("Submitted", false)).toBe("NotStarted");
    expect(mapState("In Progress", false)).toBe("InProgress");
    expect(mapState("To Verify", false)).toBe("InReview");
    expect(mapState("Ready for test", false)).toBe("InQA");
    expect(mapState("Fixed", true)).toBe("Completed");
  });

  it("is case- and space-insensitive", () => {
    expect(mapState("  in PROGRESS  ", false)).toBe("InProgress");
  });

  it("falls back to the resolved flag for a state it has never seen", () => {
    // The one signal YouTrack guarantees whatever the workflow looks like.
    expect(mapState("Awaiting Treasury Sign-off", false)).toBe("NotStarted");
    expect(mapState("Awaiting Treasury Sign-off", true)).toBe("Completed");
    expect(mapState(null, false)).toBe("NotStarted");
  });

  it("treats rejected resolutions as no-longer-outstanding (DM1.42)", () => {
    expect(mapState("Won't fix", true)).toBe("Completed");
    expect(mapState("Duplicate", true)).toBe("Completed");
  });

  it("lets a per-project override beat the default", () => {
    // A customer whose "To Verify" means QA, not code review.
    expect(mapState("To Verify", false, { "to verify": "InQA" })).toBe("InQA");
    // …and an override for a state the defaults have never heard of.
    expect(mapState("Awaiting Treasury Sign-off", false, { "awaiting treasury sign-off": "InReview" })).toBe("InReview");
  });
});

describe("type and priority mapping", () => {
  it("maps types onto the QUBIT taxonomy, defaulting to Feature", () => {
    expect(mapType("Bug")).toBe("Bug");
    expect(mapType("User Story")).toBe("Feature");
    expect(mapType("Usability Problem")).toBe("Improvement");
    expect(mapType("Task")).toBe("Chore");
    expect(mapType("Something bespoke")).toBe("Feature");
  });

  it("maps YouTrack's priority ladder, defaulting to Medium", () => {
    expect(mapPriority("Show-stopper")).toBe("Critical");
    expect(mapPriority("Major")).toBe("High");
    expect(mapPriority("Normal")).toBe("Medium");
    expect(mapPriority("Minor")).toBe("Low");
    expect(mapPriority("P7")).toBe("Medium");
    expect(mapPriority("P7", { p7: "Low" })).toBe("Low");
  });
});

describe("mapIssue", () => {
  it("produces a complete QUBIT row from a stock issue", () => {
    const m = mapIssue(issue(), BASE)!;
    expect(m.externalId).toBe("2-1043");
    expect(m.externalKey).toBe("RBC-17");
    expect(m.externalUrl).toBe(`${BASE}/issue/RBC-17`);
    expect(m.title).toBe("Statement export truncates at 500 rows");
    expect(m.status).toBe("InProgress");
    expect(m.type).toBe("Bug");
    expect(m.priority).toBe("High");
    expect(m.assigneeEmail).toBe("user_001@example.invalid");
    expect(m.assigneeName).toBe("A Okello");
  });

  it("carries priority onto severity for bugs only", () => {
    expect(mapIssue(issue(), BASE)!.severity).toBe("High");
    const feature = issue({ customFields: [{ name: "Type", value: { name: "Feature" } }, { name: "Priority", value: { name: "Major" } }] });
    expect(mapIssue(feature, BASE)!.severity).toBeNull();
  });

  it("refuses an issue with no id rather than guessing one", () => {
    expect(mapIssue(issue({ id: undefined }), BASE)).toBeNull();
  });

  it("degrades instead of throwing when custom fields are missing entirely", () => {
    const bare = mapIssue({ id: "2-1", idReadable: "RBC-1", summary: "Bare" }, BASE)!;
    expect(bare.status).toBe("NotStarted");
    expect(bare.type).toBe("Feature");
    expect(bare.priority).toBe("Medium");
    expect(bare.assigneeEmail).toBeNull();
  });

  it("never renders a blank card when the summary is empty", () => {
    expect(mapIssue(issue({ summary: "   " }), BASE)!.title).toBe("RBC-17");
  });

  it("reads a multi-value custom field by taking the first entry", () => {
    const multi = issue({ customFields: [{ name: "State", value: [{ name: "Fixed" }, { name: "Verified" }] }] });
    expect(mapIssue(multi, BASE)!.status).toBe("Completed");
  });

  it("matches custom-field names case-insensitively", () => {
    const odd = issue({ customFields: [{ name: "state", value: { name: "In Progress" } }] });
    expect(mapIssue(odd, BASE)!.status).toBe("InProgress");
  });

  it("keeps a trailing-slash base URL from producing a double slash", () => {
    expect(mapIssue(issue(), `${BASE}/`)!.externalUrl).toBe(`${BASE}/issue/RBC-17`);
  });

  it("reads the Due Date custom field as a timestamp", () => {
    const due = Date.parse("2026-08-15T00:00:00Z");
    const m = mapIssue(issue({ customFields: [{ name: "Due Date", value: due }] }), BASE)!;
    expect(m.dueDate?.getTime()).toBe(due);
  });
});

describe("summarizeYoutrack", () => {
  it("counts open work, bugs and unassigned issues", () => {
    const issues = [
      mapIssue(issue(), BASE)!,
      mapIssue(issue({ id: "2-2", idReadable: "RBC-2", customFields: [{ name: "State", value: { name: "Fixed" } }] }), BASE)!,
      mapIssue(issue({ id: "2-3", idReadable: "RBC-3", customFields: [{ name: "Type", value: { name: "Bug" } }, { name: "Priority", value: { name: "Show-stopper" } }] }), BASE)!,
    ];
    const s = summarizeYoutrack("RBC", issues);
    expect(s.headline).toBe("RBC · 2 open");
    expect(s.lines[1]).toContain("Open bugs: 2");
    expect(s.lines[1]).toContain("2 critical/high");
    expect(s.lines[2]).toBe("Unassigned: 1");
  });
});

describe("SSRF guard address classification", () => {
  it("refuses loopback, private, link-local and CGNAT ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.10", "172.16.4.4", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    // 169.254.169.254 above is the cloud metadata endpoint — the case that matters most.
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("judges IPv4-mapped IPv6 on the embedded address", () => {
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("refuses anything it cannot parse", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("parseConfig", () => {
  it("requires a base URL", () => {
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig({})).toBeNull();
    expect(parseConfig({ baseUrl: "   " })).toBeNull();
  });

  it("lower-cases override keys so lookups match regardless of casing", () => {
    const c = parseConfig({ baseUrl: BASE, fieldMap: { state: { "Ready For Test": "InQA" } } })!;
    expect(c.fieldMap?.state).toEqual({ "ready for test": "InQA" });
  });

  it("drops non-string values rather than trusting hand-edited JSON", () => {
    const c = parseConfig({ baseUrl: BASE, fieldMap: { state: { open: 7, closed: "Completed" } } })!;
    expect(c.fieldMap?.state).toEqual({ closed: "Completed" });
  });
});

describe("changedFields", () => {
  const base = {
    title: "T", description: null, status: "InProgress", type: "Bug", priority: "High",
    severity: "High", dueDate: null, assigneeId: null, externalAssigneeName: "A Okello",
    externalKey: "RBC-17", externalUrl: `${BASE}/issue/RBC-17`,
  };

  it("reports nothing for an identical row — the idempotency guarantee", () => {
    expect(changedFields(base, { ...base })).toEqual([]);
  });

  it("compares dates by value, not identity", () => {
    const d = new Date("2026-08-01T00:00:00Z");
    expect(changedFields({ ...base, dueDate: d }, { ...base, dueDate: new Date(d) })).toEqual([]);
    expect(changedFields({ ...base, dueDate: d }, { ...base, dueDate: null })).toEqual(["dueDate"]);
  });

  it("names exactly the fields that moved", () => {
    expect(changedFields(base, { ...base, status: "Completed", priority: "Low" })).toEqual(["status", "priority"]);
  });
});

describe("field-mapping editor parsing", () => {
  it("reads one mapping per line, lower-casing the source value", () => {
    const r = parseMapLines("Ready For Test = InQA\nOn Hold = NotStarted", ["NotStarted", "InQA"]);
    expect(r).toEqual({ map: { "ready for test": "InQA", "on hold": "NotStarted" } });
  });

  it("rejects a target outside the taxonomy instead of silently dropping it", () => {
    const r = parseMapLines("Open = Backlog", ["NotStarted", "InQA"]);
    expect("error" in r && r.error).toContain("Backlog");
  });

  it("rejects a line with no separator", () => {
    expect("error" in parseMapLines("just some words", ["NotStarted"])).toBe(true);
  });

  it("splits on the LAST equals so a source value may contain one", () => {
    const r = parseMapLines("a = b = InQA", ["InQA"]);
    expect(r).toEqual({ map: { "a = b": "InQA" } });
  });

  it("ignores blank lines", () => {
    expect(parseMapLines("\n\n  \n", ["InQA"])).toEqual({ map: {} });
  });
});
