import { describe, expect, it } from "vitest";
import {
  ACCESS_REQUEST_REPORT_STATUSES,
  ADMIN_DATASET_KEYS,
  MY_DATASET_KEYS,
  myProjectRole,
  REPORT_DATASETS,
  REPORT_DATASET_KEYS,
  reportDataset,
  USER_REPORT_MFA,
  USER_REPORT_STATUSES,
} from "@/lib/report-catalogue";

// The registry is the allow-list the server validates against — its integrity IS the
// column-level security boundary, so it gets its own tests.

describe("report catalogue registry", () => {
  it("dataset keys are unique and resolvable", () => {
    expect(new Set(REPORT_DATASET_KEYS).size).toBe(REPORT_DATASETS.length);
    for (const key of REPORT_DATASET_KEYS) expect(reportDataset(key).key).toBe(key);
  });

  it("column keys are unique within each dataset, with non-empty labels", () => {
    for (const d of REPORT_DATASETS) {
      expect(d.columns.length).toBeGreaterThan(0);
      const keys = d.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const c of d.columns) {
        expect(c.key.trim()).not.toBe("");
        expect(c.label.trim()).not.toBe("");
      }
    }
  });

  it("defaults are a non-empty subset of the dataset's columns", () => {
    for (const d of REPORT_DATASETS) {
      expect(d.defaults.length).toBeGreaterThan(0);
      const keys = new Set(d.columns.map((c) => c.key));
      for (const def of d.defaults) expect(keys.has(def)).toBe(true);
    }
  });

  it("enum columns carry their value set", () => {
    for (const d of REPORT_DATASETS) {
      for (const c of d.columns) {
        if (c.type === "enum") expect(c.values?.length ?? 0).toBeGreaterThan(0);
        else expect(c.values).toBeUndefined();
      }
    }
  });

  it("never exposes credential or MFA fields", () => {
    const forbidden = /password|secret|hash|recovery|token|totp|otp/i;
    for (const d of REPORT_DATASETS) {
      for (const c of d.columns) {
        expect(c.key).not.toMatch(forbidden);
        expect(c.label).not.toMatch(forbidden);
        // UX11: the only MFA column allowed is the users report's On / Off / SSO STATUS —
        // never the secret or anything derived from it.
        if (/mfa/i.test(c.key) || /mfa/i.test(c.label)) {
          expect(`${d.key}.${c.key}`).toBe("users.mfa");
          expect(c.type).toBe("enum");
          expect(c.values).toEqual(["On", "Off", "SSO"]);
        }
      }
    }
  });

  it("every dataset names its module group and description", () => {
    for (const d of REPORT_DATASETS) {
      expect(d.moduleLabel.trim()).not.toBe("");
      expect(d.description.trim()).not.toBe("");
    }
  });
});

describe("UX6 — the My … datasets", () => {
  it("are registered, grouped under My work, with the agreed labels", () => {
    expect(MY_DATASET_KEYS.map((k) => reportDataset(k).label)).toEqual(["My tasks", "My projects", "Blockers I raised"]);
    for (const k of MY_DATASET_KEYS) expect(reportDataset(k).moduleLabel).toBe("My work");
  });

  it("carry the columns the plan names", () => {
    const keys = (k: (typeof MY_DATASET_KEYS)[number]) => reportDataset(k).columns.map((c) => c.key);
    expect(keys("myTasks")).toEqual(expect.arrayContaining(["title", "key", "project", "status", "dueDate", "estimate", "priority", "type", "blocked"]));
    expect(keys("myProjects")).toEqual(expect.arrayContaining(["code", "name", "role", "status", "dueDate", "openTasks"]));
    expect(keys("myBlockers")).toEqual(expect.arrayContaining(["description", "project", "task", "status", "dateRaised", "owner", "resolutionNotes"]));
  });

  it("dates go through the date cell type", () => {
    for (const [k, col] of [["myTasks", "dueDate"], ["myProjects", "dueDate"], ["myBlockers", "dateRaised"]] as const) {
      expect(reportDataset(k).columns.find((c) => c.key === col)?.type).toBe("date");
    }
  });
});

describe("UX11 — the admin datasets", () => {
  it("are registered under Admin & access with the agreed labels", () => {
    expect(ADMIN_DATASET_KEYS.map((k) => reportDataset(k).label)).toEqual(["Users", "Access requests"]);
    for (const k of ADMIN_DATASET_KEYS) expect(reportDataset(k).moduleLabel).toBe("Admin & access");
  });

  it("users carries the directory columns, typed", () => {
    const cols = reportDataset("users").columns;
    expect(cols.map((c) => c.key)).toEqual(["name", "email", "roles", "department", "status", "mfa", "lastActive", "createdAt", "teams"]);
    const type = (k: string) => cols.find((c) => c.key === k)?.type;
    expect(type("lastActive")).toBe("date");
    expect(type("createdAt")).toBe("date");
    expect(cols.find((c) => c.key === "status")?.values).toEqual([...USER_REPORT_STATUSES]);
    expect(cols.find((c) => c.key === "mfa")?.values).toEqual([...USER_REPORT_MFA]);
    expect(USER_REPORT_STATUSES).not.toContain("Deleted");
  });

  it("accessRequests carries the queue columns, typed", () => {
    const cols = reportDataset("accessRequests").columns;
    expect(cols.map((c) => c.key)).toEqual(["name", "email", "company", "jobTitle", "status", "submittedAt", "reviewedAt"]);
    expect(cols.map((c) => c.label)).toEqual(["Name", "Email", "Company", "Job title", "Status", "Submitted", "Reviewed at"]);
    expect(cols.find((c) => c.key === "submittedAt")?.type).toBe("date");
    expect(cols.find((c) => c.key === "reviewedAt")?.type).toBe("date");
    expect(cols.find((c) => c.key === "status")?.values).toEqual([...ACCESS_REQUEST_REPORT_STATUSES]);
  });
});

describe("myProjectRole", () => {
  it("leads with Project lead, then membership roles, de-duplicated", () => {
    expect(myProjectRole(true, [])).toBe("Project lead");
    expect(myProjectRole(false, ["Developer"])).toBe("Developer");
    expect(myProjectRole(true, ["project lead", "Analyst", "Analyst "])).toBe("Project lead, Analyst");
    expect(myProjectRole(false, [" ", ""])).toBeNull();
  });
});
