// M-P4a (docs/35 §1) — the WIRE schemas, parsed exactly as the routes parse them. The
// M-P1c lesson: engine tests can stay green while a route's Zod rejects the real payload
// (CheckpointTemplate CUIDs vs .uuid()), so pin the wire contract separately.
import { describe, expect, it } from "vitest";
import { SubmitIdeaInput } from "@/server/ideas";
import { CreateProjectWizardInput } from "@/server/project-wizard";

describe("SubmitIdeaInput", () => {
  const valid = {
    title: "Instant merchant settlement",
    sponsor: "Head of Merchant Banking",
    problem: "Merchants wait T+1 for settlement; competitors offer instant.",
    expectedValue: "Retain 200+ merchants",
    suggestedPortfolioId: "11111111-1111-1111-1111-111111111111",
  };

  it("accepts the form's payload and trims", () => {
    const parsed = SubmitIdeaInput.parse({ ...valid, title: "  Instant merchant settlement  " });
    expect(parsed.title).toBe("Instant merchant settlement");
  });

  it("makes the optional fields genuinely optional (the form sends null)", () => {
    const parsed = SubmitIdeaInput.parse({
      title: valid.title,
      sponsor: valid.sponsor,
      problem: valid.problem,
      expectedValue: null,
      suggestedPortfolioId: null,
    });
    expect(parsed.expectedValue).toBeNull();
    expect(parsed.suggestedPortfolioId).toBeNull();
  });

  it("refuses a thin idea — no title, no sponsor, no problem", () => {
    expect(SubmitIdeaInput.safeParse({ ...valid, title: "abc" }).success).toBe(false);
    expect(SubmitIdeaInput.safeParse({ ...valid, sponsor: "" }).success).toBe(false);
    expect(SubmitIdeaInput.safeParse({ ...valid, problem: "too short" }).success).toBe(false);
  });
});

describe("CreateProjectWizardInput fromIdeaId", () => {
  const base = { name: "Accepted idea project", portfolioId: "11111111-1111-1111-1111-111111111111" };

  it("accepts the accept-flow payload the wizard actually posts", () => {
    const parsed = CreateProjectWizardInput.parse({
      ...base,
      fromIdeaId: "22222222-2222-2222-2222-222222222222",
    });
    expect(parsed.fromIdeaId).toBe("22222222-2222-2222-2222-222222222222");
    expect(parsed.pipelineStage).toBe("Exploring"); // an accepted idea lands in Exploring
  });

  it("stays optional — the ordinary blank wizard omits it", () => {
    expect(CreateProjectWizardInput.parse(base).fromIdeaId).toBeUndefined();
    expect(CreateProjectWizardInput.parse({ ...base, fromIdeaId: undefined }).fromIdeaId).toBeUndefined();
  });

  it("rejects a non-uuid idea id rather than passing it to the engine", () => {
    expect(CreateProjectWizardInput.safeParse({ ...base, fromIdeaId: "not-a-uuid" }).success).toBe(false);
  });
});
