// Admin › Integrations — the paste helper that fills YouTrack keys from a `code,key` list.
import { describe, expect, it } from "vitest";
import { parseCodeKeyList } from "@/lib/youtrack-paste";

describe("parseCodeKeyList", () => {
  it("reads code,key pairs with any common separator, upper-cases codes, tolerates a header and a BOM", () => {
    const { pairs, errors } = parseCodeKeyList("﻿code,key\nkeza,KZ\nSWIPE-KE\tSWK\n\n\"ANCHOR\";AN\n");
    expect(errors).toEqual([]);
    expect(pairs).toEqual([
      { line: 2, code: "KEZA", key: "KZ" },
      { line: 3, code: "SWIPE-KE", key: "SWK" },
      { line: 5, code: "ANCHOR", key: "AN" },
    ]);
  });

  it("reports a line with the wrong shape or a repeated code, and keeps going", () => {
    const { pairs, errors } = parseCodeKeyList("KEZA,KZ\nKEZA,KZ2\nONLYCODE\nA,B,C\nLUMI,LM");
    expect(pairs.map((p) => p.code)).toEqual(["KEZA", "LUMI"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[0]!.message).toContain("twice");
  });
});
