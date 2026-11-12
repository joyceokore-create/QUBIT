import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFromIssues, firstInvalid, readApiError } from "@/lib/form-errors";
import { InviteDetailsSchema } from "@/lib/invite-schema";
import { NewRiskFormSchema } from "@/lib/risk-schema";
import { validationError } from "@/server/errors";

// docs/08 § Errors — errors sit on the field.
describe("form errors", () => {
  it("keeps the first issue per field, dot-joins nested paths and maps root to _", () => {
    const schema = z.object({ name: z.string().min(1, "Enter a name.").min(3, "Too short."), team: z.array(z.object({ start: z.string().min(1, "Pick a date.") })) });
    const r = schema.safeParse({ name: "", team: [{ start: "" }] });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(fieldErrorsFromIssues(r.error.issues)).toEqual({ name: "Enter a name.", "team.0.start": "Pick a date." });
    expect(fieldErrorsFromIssues([{ path: [], message: "Whole form." }])).toEqual({ _: "Whole form." });
    expect(fieldErrorsFromIssues([{ path: ["projectId"], message: "x" }], { projectId: "project" })).toEqual({ project: "x" });
  });

  it("finds the first invalid field in form order", () => {
    expect(firstInvalid(["name", "email"], { email: "e" })).toBe("email");
    expect(firstInvalid(["name"], {})).toBeNull();
  });

  it("reads the API envelope, ignoring non-string field values", () => {
    expect(readApiError({ error: { message: "Bad.", fields: { email: "Taken.", x: 1 } } }, "Fallback.")).toEqual({ message: "Bad.", fields: { email: "Taken." } });
    expect(readApiError(null, "Fallback.")).toEqual({ message: "Fallback.", fields: {} });
  });

  it("shared form schemas carry user-facing copy", () => {
    const invite = InviteDetailsSchema.safeParse({ name: " ", email: "jane@" });
    expect(invite.success).toBe(false);
    if (!invite.success) expect(fieldErrorsFromIssues(invite.error.issues)).toEqual({ name: "Enter a full name.", email: "Enter a work email, like name@company.com." });
    expect(InviteDetailsSchema.safeParse({ name: "Jane", email: "jane@wrong-but-valid.example" }).success).toBe(true);
    const risk = NewRiskFormSchema.safeParse({ title: "ab", probability: 3, impact: 9 });
    if (!risk.success) expect(fieldErrorsFromIssues(risk.error.issues)).toEqual({ title: "The title must be at least 3 characters.", impact: "Choose an impact between 1 and 5." });
  });

  it("validationError returns fields and the first message, keeping the old envelope", async () => {
    const r = InviteDetailsSchema.safeParse({ name: "", email: "" });
    if (r.success) throw new Error("expected failure");
    const res = validationError(r.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe("Enter a full name.");
    expect(body.error.fields).toEqual({ name: "Enter a full name.", email: "Enter a work email." });
  });
});
