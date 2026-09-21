import { describe, expect, it } from "vitest";
import { REPORT_DATASETS, REPORT_DATASET_KEYS, reportDataset } from "@/lib/report-catalogue";

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
    const forbidden = /password|mfa|secret|hash|recovery/i;
    for (const d of REPORT_DATASETS) {
      for (const c of d.columns) {
        expect(c.key).not.toMatch(forbidden);
        expect(c.label).not.toMatch(forbidden);
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
