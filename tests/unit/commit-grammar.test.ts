// M7-B commit grammar (docs/15 §6.3) — table-driven, because the grammar IS the contract
// developers learn. Pure: no DB, no network.
import { describe, expect, it } from "vitest";
import { commitTitle, parseCommitMessage } from "@/server/connectors/github-commit-grammar";
import { verifyGithubSignature } from "@/server/connectors/github-webhook";
import { createHmac } from "node:crypto";

describe("parseCommitMessage", () => {
  const cases: { name: string; message: string; expect: { key: string; action: string; reason?: string }[] }[] = [
    { name: "bare key is a mention", message: "P001-12 tidy up the export mapper", expect: [{ key: "P001-12", action: "mention" }] },
    { name: "#progress", message: "P001-12 #progress wire up the endpoint", expect: [{ key: "P001-12", action: "progress" }] },
    { name: "#done", message: "P001-12 #done", expect: [{ key: "P001-12", action: "done" }] },
    { name: "fixes KEY", message: "fixes P001-12: null check on the payee form", expect: [{ key: "P001-12", action: "done" }] },
    { name: "closes KEY", message: "Closes P001-12", expect: [{ key: "P001-12", action: "done" }] },
    { name: "resolved KEY", message: "resolved P001-12 after the hotfix", expect: [{ key: "P001-12", action: "done" }] },
    {
      name: "#blocked captures the reason to end of line",
      message: "P001-12 #blocked waiting on treasury API creds\nunrelated second line",
      expect: [{ key: "P001-12", action: "blocked", reason: "waiting on treasury API creds" }],
    },
    { name: "#blocked with no reason still blocks", message: "P001-12 #blocked", expect: [{ key: "P001-12", action: "blocked" }] },
    {
      name: "multiple keys, mixed actions",
      message: "fixes P001-3 and P001-4 #progress; see P001-5",
      expect: [
        { key: "P001-3", action: "done" },
        { key: "P001-4", action: "progress" },
        { key: "P001-5", action: "mention" },
      ],
    },
    { name: "case-insensitive keys and tags, uppercased out", message: "p001-12 #PROGRESS", expect: [{ key: "P001-12", action: "progress" }] },
    { name: "blocked outranks done on the same key", message: "P001-12 #done P001-12 #blocked broke staging", expect: [{ key: "P001-12", action: "blocked", reason: "broke staging" }] },
    { name: "done outranks a plain mention", message: "P001-12 refactor, fixes P001-12", expect: [{ key: "P001-12", action: "done" }] },
    { name: "no keys, no directives", message: "chore: bump deps", expect: [] },
    { name: "YouTrack-style key parses the same", message: "RBC-123 #progress", expect: [{ key: "RBC-123", action: "progress" }] },
    { name: "a bare hash tag with no key does nothing", message: "#done thoughts on naming", expect: [] },
    { name: "empty message", message: "", expect: [] },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const got = parseCommitMessage(c.message).map(({ key, action, reason }) => ({ key, action, ...(reason ? { reason } : {}) }));
      expect(got).toEqual(c.expect);
    });
  }

  it("caps a runaway #blocked reason", () => {
    const [d] = parseCommitMessage(`P1-1 #blocked ${"x".repeat(1000)}`);
    expect(d.reason).toHaveLength(300);
  });
});

describe("commitTitle", () => {
  it("keeps the first line, trimmed and capped", () => {
    expect(commitTitle("fix: the thing\n\nlong body")).toBe("fix: the thing");
    expect(commitTitle(`${"y".repeat(600)}`)).toHaveLength(500);
  });
});

describe("verifyGithubSignature", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ repository: { full_name: "acme/repo" } });
  const sign = (s: string, b: string) => `sha256=${createHmac("sha256", s).update(b, "utf8").digest("hex")}`;

  it("accepts a correct signature", () => {
    expect(verifyGithubSignature(body, sign(secret, body), secret)).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyGithubSignature(body, sign("other-secret", body), secret)).toBe(false);
  });

  it("rejects a signature over a DIFFERENT body — the proxy-rewrite failure mode", () => {
    expect(verifyGithubSignature(body + "\n", sign(secret, body), secret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyGithubSignature(body, null, secret)).toBe(false);
    expect(verifyGithubSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyGithubSignature(body, "sha256=nothex", secret)).toBe(false);
  });
});
