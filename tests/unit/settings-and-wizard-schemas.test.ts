import { describe, expect, it } from "vitest";
import { fieldErrorsFromIssues, type FieldErrors } from "@/lib/form-errors";
import { RetentionBodySchema, RetentionFormSchema } from "@/lib/retention-schema";
import { TimeZoneBodySchema } from "@/lib/time-zone-schema";
import { NewOrgUnitFormSchema } from "@/lib/org-unit-schema";
import { ProjectWizardFormSchema, PROJECT_ERROR_FIELD } from "@/lib/project-wizard-schema";
import { PortfolioWizardFormSchema } from "@/lib/portfolio-wizard-schema";
import { YoutrackConnectFormSchema, YoutrackReplaceTokenSchema } from "@/lib/youtrack-schema";
import { PeopleImportBodySchema } from "@/lib/people-import-schema";
import { accessRequestSchema } from "@/lib/access-request-schema";
import type { ZodType } from "zod";

function errs(schema: ZodType, v: unknown): FieldErrors {
  const r = schema.safeParse(v);
  return r.success ? {} : fieldErrorsFromIssues(r.error.issues);
}

describe("retention schema", () => {
  it("gives empty, decimal and out-of-range their own message", () => {
    expect(errs(RetentionFormSchema, { days: "" }).days).toBe("Enter a number of days.");
    expect(errs(RetentionFormSchema, { days: "12.5" }).days).toBe("Enter a whole number of days.");
    expect(errs(RetentionFormSchema, { days: "3" }).days).toBe("Choose a number of days between 7 and 365.");
    expect(errs(RetentionFormSchema, { days: "400" }).days).toBe("Choose a number of days between 7 and 365.");
    expect(errs(RetentionFormSchema, { days: "30" })).toEqual({});
  });
  it("server body says the same", () => {
    expect(errs(RetentionBodySchema, { days: 6 }).days).toBe("Choose a number of days between 7 and 365.");
    expect(errs(RetentionBodySchema, { days: "x" }).days).toBe("Enter a whole number of days.");
  });
});

describe("time zone schema", () => {
  it("accepts an IANA zone and rejects blanks and junk", () => {
    expect(errs(TimeZoneBodySchema, { timeZone: "Africa/Nairobi" })).toEqual({});
    expect(errs(TimeZoneBodySchema, { timeZone: "" }).timeZone).toBe("Choose a time zone.");
    expect(errs(TimeZoneBodySchema, { timeZone: "Mars/Olympus" }).timeZone).toBe("Choose a time zone from the list.");
  });
});

describe("org unit schema", () => {
  it("checks code, name and flag", () => {
    expect(errs(NewOrgUnitFormSchema, { code: "", name: "", flag: "" })).toEqual({ code: "Enter a code.", name: "Enter a name." });
    expect(errs(NewOrgUnitFormSchema, { code: "a", name: "D", flag: "" })).toEqual({ code: "Code must be 2–12 letters, digits or dashes.", name: "The name must be at least 2 characters." });
    expect(errs(NewOrgUnitFormSchema, { code: "drc", name: "DR Congo", flag: "" })).toEqual({});
  });
});

describe("project wizard schema", () => {
  const ok = { name: "Payments Hub", code: "", portfolioId: "5b6f0e3e-2a53-4a52-9d5c-6f3a8c1d2e4f", team: [] };
  it("checks the basics step", () => {
    expect(errs(ProjectWizardFormSchema, ok)).toEqual({});
    expect(errs(ProjectWizardFormSchema, { ...ok, name: "", portfolioId: "" })).toEqual({ name: "Enter a project name.", portfolioId: "Choose a portfolio." });
    expect(errs(ProjectWizardFormSchema, { ...ok, code: "x" }).code).toBe("Code must be 2–10 letters or digits.");
    expect(errs(ProjectWizardFormSchema, { ...ok, code: "pay1" })).toEqual({});
  });
  it("puts a backwards window on the row's end date (nested path)", () => {
    const team = [{ allocationPct: 50, startDate: "2026-12-10", endDate: "2026-12-01" }];
    expect(errs(ProjectWizardFormSchema, { ...ok, team })).toEqual({ "team.0.endDate": "The end date can’t be before the start date." });
  });
  it("maps domain rejections to fields", () => {
    expect(PROJECT_ERROR_FIELD.CODE_TAKEN).toBe("code");
  });
});

describe("portfolio wizard schema", () => {
  it("checks the identity step", () => {
    expect(errs(PortfolioWizardFormSchema, { name: "", description: "" }).name).toBe("Enter a portfolio name.");
    expect(errs(PortfolioWizardFormSchema, { name: "Open Banking", description: "" })).toEqual({});
  });
});

describe("youtrack schema", () => {
  it("wants an https URL and a token", () => {
    expect(errs(YoutrackConnectFormSchema, { baseUrl: "", token: "" })).toEqual({ baseUrl: "Enter the instance URL.", token: "Enter the permanent token." });
    expect(errs(YoutrackConnectFormSchema, { baseUrl: "http://x.youtrack.cloud", token: "t" }).baseUrl).toMatch(/https/);
    expect(errs(YoutrackConnectFormSchema, { baseUrl: "https://acme.youtrack.cloud", token: "perm:abc" })).toEqual({});
    expect(errs(YoutrackReplaceTokenSchema, { token: " " }).token).toBe("Enter the new token.");
  });
});

describe("people import schema", () => {
  it("asks for a CSV and caps its size", () => {
    expect(errs(PeopleImportBodySchema, { csv: "  " }).csv).toBe("Paste your CSV or choose a file.");
    expect(errs(PeopleImportBodySchema, { csv: "x".repeat(200_001) }).csv).toMatch(/200,000/);
    expect(errs(PeopleImportBodySchema, { csv: "name,email" })).toEqual({});
  });
});

describe("access request schema copy", () => {
  it("uses the shared field messages", () => {
    const e = errs(accessRequestSchema, { fullName: "", email: "", company: "" });
    expect(e).toEqual({ fullName: "Enter your full name.", email: "Enter your work email.", company: "Enter your company name." });
    expect(errs(accessRequestSchema, { fullName: "A", email: "nope", company: "B" }).email).toBe("Enter a work email, like name@company.com.");
  });
});
