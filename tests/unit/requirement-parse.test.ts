// The deterministic requirement parser (docs/16 §6). It runs whenever the Q AI box is
// unconfigured, so the ingest feature works without an LLM rather than failing shut —
// which makes its behaviour worth pinning exactly.
import { describe, expect, it } from "vitest";
import { parseCandidates } from "@/server/requirements";

const URS = `
# 1. Introduction
This document describes the payments platform.

## 3.1 Settlement
The system must reconcile mobile wallet transactions nightly.
The platform shall retry a failed settlement up to three times.

## 3.2 Reporting
Users should be able to export a statement as PDF.

## 4. Glossary
A wallet is a stored-value account.
`;

describe("parseCandidates", () => {
  it("keeps the nearest section heading as each requirement's anchor", () => {
    const out = parseCandidates(URS);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      sectionAnchor: "3.1 Settlement",
      text: "The system must reconcile mobile wallet transactions nightly.",
    });
    expect(out[1].sectionAnchor).toBe("3.1 Settlement");
    expect(out[2].sectionAnchor).toBe("3.2 Reporting");
  });

  it("ignores prose that states no obligation", () => {
    const out = parseCandidates(URS);
    // Background and glossary lines carry no must/shall/should.
    expect(out.some((c) => c.text.includes("This document describes"))).toBe(false);
    expect(out.some((c) => c.text.includes("stored-value account"))).toBe(false);
  });

  it("returns nothing rather than inventing requirements", () => {
    expect(parseCandidates("Just some notes about the weather.")).toEqual([]);
    expect(parseCandidates("")).toEqual([]);
  });
});
