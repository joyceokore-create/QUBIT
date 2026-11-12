import { z } from "zod";
import { formMessages as m } from "@/lib/form-messages";

/**
 * Field rules for the project-workspace and report editors (docs/08 § Errors). One definition,
 * used by the editor (via `useFieldErrors`) and by the API route's input schema, so the browser
 * and the server say the same thing. Client-safe — no server imports.
 */

/** A named instance / module (project_instances route). */
export const instanceName = (what?: string) => z.string().trim().min(1, m.enter(what ? `a name for the ${what}` : "a name")).max(60, m.maxLength("the name", 60));
export const InstanceNameFormSchema = (what: string) => z.object({ name: instanceName(what) });

/** What a product calls its modules (project settings). */
export const moduleLabel = z.string().trim().min(2, m.minLength("the name", 2)).max(30, m.maxLength("the name", 30));
export const ModuleLabelFormSchema = z.object({ moduleLabel });

/** One-line pipeline status note (optional). */
export const statusNote = z.string().trim().max(200, m.maxLength("the note", 200));
export const StatusNoteFormSchema = z.object({ statusNote });

/** Closing a gate whose checklist is unmet. */
export const gateOverrideReason = z.string().trim().min(1, "Say why the gate is being closed early.").min(5, "Say why the gate is being closed early.").max(300, m.maxLength("the reason", 300));
export const GateOverrideFormSchema = z.object({ overrideReason: gateOverrideReason });

/** Lessons learned. */
export const lessonTitle = z.string().trim().min(1, "Say what the lesson is.").min(3, m.minLength("the lesson", 3)).max(200, m.maxLength("the lesson", 200));
export const LessonFormSchema = z.object({ title: lessonTitle });

/** Per-market weekly check-in narrative. */
export const marketNarrative = z.string().trim().min(1, "Say what the focus and blockers are.").max(1000, m.maxLength("the note", 1000));
export const MarketCheckInFormSchema = z.object({ narrative: marketNarrative });

/** Project status update. */
export const statusUpdateBody = z.string().trim().min(1, m.enter("the update"));
export const StatusUpdateFormSchema = z.object({ body: statusUpdateBody });

/** Milestone. */
export const milestoneName = z.string().trim().min(1, m.enter("a milestone name"));
export const MilestoneFormSchema = z.object({ name: milestoneName });

/** Blocker. */
export const blockerDescription = z.string().trim().min(1, m.enter("what is blocking the work"));
export const BlockerFormSchema = z.object({ description: blockerDescription });

/** Cross-project dependency. */
export const dependencyNote = z.string().trim().max(200, m.maxLength("the note", 200));
export const DependencyFormSchema = z.object({ dependsOnProjectId: z.string().min(1, m.choose("a project")), note: dependencyNote });

/** Add a document: a title, and either text or an attached file. */
export const documentTitle = z.string().trim().min(1, m.enter("a title"));
export const documentHasBody = (v: { content?: string | null; fileData?: string | null }) => Boolean(v.content?.trim()) || Boolean(v.fileData);
export const DOCUMENT_BODY_MESSAGE = "Paste the document text or attach a PDF.";
export const DocumentFormSchema = z
  .object({ title: documentTitle, content: z.string(), fileData: z.string().nullable() })
  .superRefine((v, ctx) => {
    if (!documentHasBody(v)) ctx.addIssue({ code: "custom", path: ["content"], message: DOCUMENT_BODY_MESSAGE });
  });

/** YouTrack connection (project integrations). */
export const YOUTRACK_URL_MESSAGE = "Enter the full instance URL, like https://yourcompany.youtrack.cloud.";
export const youtrackBaseUrl = z.string().trim().min(1, YOUTRACK_URL_MESSAGE).url(YOUTRACK_URL_MESSAGE);
export const integrationToken = z.string().min(1, m.enter("an access token"));

/** Head's one-line narrative on the weekly roll-up (approve). */
export const rollupNarrative = z.string().trim().min(1, m.enter("the week in one line")).min(5, m.minLength("the line", 5)).max(1000, m.maxLength("the line", 1000));
export const RollupFormSchema = z.object({ narrative: rollupNarrative });
