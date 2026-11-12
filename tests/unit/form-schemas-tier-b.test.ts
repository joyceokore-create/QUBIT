// Field-level error copy for the Tier B drawers and dialogs (docs/08 § Errors): each shared schema
// says one specific, sentence-case thing per field, restating the limit where there is one.
import { describe, expect, it } from "vitest";
import { fieldErrorsFromIssues } from "@/lib/form-errors";
import type { ZodType } from "zod";
import { DepartmentFormSchema } from "@/lib/department-schema";
import { TeamFormSchema } from "@/lib/team-schema";
import { DeactivateRoleFormSchema, NewRoleFormSchema, roleErrorField } from "@/lib/role-schema";
import { GrantAccessFormSchema } from "@/lib/grant-access-schema";
import { NewIssueFormSchema } from "@/lib/issue-schema";
import { EditPortfolioFormSchema, NewProgrammeFormSchema } from "@/lib/portfolio-schema";
import { EditProjectFormSchema, END_BEFORE_START } from "@/lib/project-schema";
import { AssignMembersFormSchema, PEOPLE_REQUIRED } from "@/lib/assign-members-schema";
import { RecordLeaveFormSchema, ABSENCE_MSG } from "@/lib/absence-schema";
import { MergeIdeaFormSchema, NewIdeaFormSchema, ParkIdeaFormSchema } from "@/lib/idea-schema";
import { decideFormSchema, raiseFormSchema, NewActionFormSchema } from "@/lib/decision-schema";
import { RecipientsFormSchema } from "@/lib/recipient-schema";
import { checkInFormSchema } from "@/lib/checkin-schema";
import { CommentFormSchema, PromoteFormSchema } from "@/lib/comment-schema";
import { MfaResetFormSchema, UserRolesFormSchema } from "@/lib/user-edit-schema";
import { RatingReasonFormSchema } from "@/lib/rating-reason-schema";
import { reasonMessage } from "@/lib/reason-schema";

const errs = (schema: ZodType, v: unknown) => {
  const r = schema.safeParse(v);
  return r.success ? {} : fieldErrorsFromIssues(r.error.issues);
};

describe("reason fields", () => {
  it("restate the limit", () => {
    expect(reasonMessage(5)).toBe("Enter a reason of at least 5 characters.");
    expect(errs(RatingReasonFormSchema, { ratingReason: "" }).ratingReason).toBe("Enter a reason of at least 5 characters.");
    expect(errs(RatingReasonFormSchema, { ratingReason: "ok" }).ratingReason).toBe("Enter a reason of at least 5 characters.");
    expect(errs(RatingReasonFormSchema, { ratingReason: "Vendor confirmed Monday" })).toEqual({});
  });
  it("park needs 5, deactivate needs 3", () => {
    expect(errs(ParkIdeaFormSchema, { reason: "no" }).reason).toBe("Enter a reason of at least 5 characters.");
    expect(errs(DeactivateRoleFormSchema, { reason: "" }).reason).toBe("Enter a reason of at least 3 characters.");
  });
});

describe("admin forms", () => {
  it("department and team names", () => {
    expect(errs(DepartmentFormSchema, { name: "  " }).name).toBe("Enter a department name.");
    expect(errs(TeamFormSchema, { name: "", description: "" }).name).toBe("Enter a team name.");
    expect(errs(TeamFormSchema, { name: "Core", description: "x".repeat(501) }).description).toBe("The description must be 500 characters or fewer.");
  });
  it("roles", () => {
    expect(errs(NewRoleFormSchema, { name: "", description: "" }).name).toBe("Enter a role name.");
    expect(errs(NewRoleFormSchema, { name: "a", description: "" }).name).toBe("The name must be at least 2 characters.");
    expect(roleErrorField("BAD_ROLE", "A role with that name already exists.")).toBe("name");
    expect(roleErrorField("BAD_ROLE", "A deactivation reason is required.")).toBe("reason");
    expect(roleErrorField("BAD_ROLE", "Unknown role.")).toBeUndefined();
    expect(roleErrorField("LOCKED", "x")).toBeUndefined();
  });
  it("user edit: roles group and MFA code", () => {
    expect(errs(UserRolesFormSchema, { roles: [] }).roles).toBe("Choose at least one role.");
    expect(errs(MfaResetFormSchema, { code: "" })).toEqual({});
    expect(errs(MfaResetFormSchema, { code: "12" }).code).toBe("Enter the 6-digit code from your authenticator app.");
  });
  it("grant access", () => {
    expect(errs(GrantAccessFormSchema, { role: "", message: "" }).role).toBe("Choose a role.");
    expect(errs(GrantAccessFormSchema, { role: "Member", message: "x".repeat(501) }).message).toBe("The message must be 500 characters or fewer.");
  });
});

describe("raid, portfolio and project forms", () => {
  it("new issue title", () => {
    expect(errs(NewIssueFormSchema, { title: "" }).title).toBe("Enter a title.");
    expect(errs(NewIssueFormSchema, { title: "ab" }).title).toBe("The title must be at least 3 characters.");
  });
  it("portfolio and programme", () => {
    expect(errs(EditPortfolioFormSchema, { name: "", description: "" }).name).toBe("Enter a portfolio name.");
    expect(errs(NewProgrammeFormSchema, { name: "", portfolioId: "" })).toEqual({ name: "Enter a programme name.", portfolioId: "Choose a portfolio." });
  });
  it("edit project: name and end-before-start on the end date", () => {
    expect(errs(EditProjectFormSchema, { name: "", startDate: "", dueDate: "" }).name).toBe("Enter a project name.");
    expect(errs(EditProjectFormSchema, { name: "P", startDate: "2026-11-10", dueDate: "2026-11-01" }).dueDate).toBe(END_BEFORE_START);
    expect(errs(EditProjectFormSchema, { name: "P", startDate: "2026-11-10", dueDate: "2026-11-10" })).toEqual({});
  });
  it("assign members", () => {
    expect(errs(AssignMembersFormSchema, { members: [], start: "", end: "" }).members).toBe(PEOPLE_REQUIRED);
    expect(errs(AssignMembersFormSchema, { members: ["u"], start: "2026-11-10", end: "2026-11-01" }).end).toBe(END_BEFORE_START);
  });
  it("record leave", () => {
    expect(errs(RecordLeaveFormSchema, { userId: "", startDate: "", endDate: "", note: "" })).toEqual({ userId: ABSENCE_MSG.person, startDate: ABSENCE_MSG.start, endDate: ABSENCE_MSG.end });
    expect(errs(RecordLeaveFormSchema, { userId: "u", startDate: "2026-11-10", endDate: "2026-11-01", note: "" }).endDate).toBe(ABSENCE_MSG.order);
  });
});

describe("ideas, decisions, reports, comments", () => {
  it("new idea", () => {
    const e = errs(NewIdeaFormSchema, { title: "", sponsor: "", problem: "short", expectedValue: "" });
    expect(e.title).toBe("Enter a title.");
    expect(e.sponsor).toBe("Enter a sponsor.");
    expect(e.problem).toBe("Describe the problem in at least 10 characters.");
    expect(errs(MergeIdeaFormSchema, { projectId: "" }).projectId).toBe("Choose a project.");
  });
  it("raise, record and action", () => {
    expect(errs(raiseFormSchema(false), { title: "ab", projectId: "" })).toEqual({ title: "The title must be at least 3 characters.", projectId: "Choose a project." });
    expect(errs(raiseFormSchema(true), { title: "Budget", projectId: "" })).toEqual({});
    expect(errs(decideFormSchema("approve", "2026-11-12"), { note: "", newDue: "" })).toEqual({});
    expect(errs(decideFormSchema("decline", "2026-11-12"), { note: "", newDue: "" }).note).toBe("Enter a reason of at least 3 characters.");
    const d = errs(decideFormSchema("defer", "2026-11-12"), { note: "later", newDue: "2026-11-12" });
    expect(d.newDue).toBe("Choose a date after today.");
    expect(errs(decideFormSchema("defer", "2026-11-12"), { note: "later", newDue: "" }).newDue).toBe("Choose the new due date.");
    expect(errs(NewActionFormSchema, { title: "" }).title).toBe("Enter a title.");
  });
  it("recipients, check-in, comments", () => {
    expect(errs(RecipientsFormSchema, { userId: "", email: "nope" })).toEqual({ userId: "Choose a person.", email: "Enter an email address, like name@company.com." });
    expect(errs(checkInFormSchema(false), { narrative: "", overrideReason: "" }).narrative).toBe("Enter the line for the Head.");
    expect(errs(checkInFormSchema(true), { narrative: "ok", overrideReason: "no" }).overrideReason).toBe("Enter a reason of at least 5 characters.");
    expect(errs(checkInFormSchema(false), { narrative: "ok", overrideReason: "" })).toEqual({});
    expect(errs(CommentFormSchema, { body: "  " }).body).toBe("Write a comment.");
    expect(errs(PromoteFormSchema, { title: "", rationale: "" }).title).toBe("Enter what was decided.");
  });
});
