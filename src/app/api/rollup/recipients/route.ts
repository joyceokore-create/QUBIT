import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { isHeadOfProjects } from "@/lib/rbac";
import { emailEnabled } from "@/server/mail/mailer";
import { AddRecipientInput, addRecipient, listCandidates, listRecipients, RecipientError, removeRecipient } from "@/server/rollup-recipients";

// Milestone D — the roll-up distribution list. Readers see the list; Heads also get the
// candidates (active users in executive seats) and may add/remove.

const STATUS: Record<RecipientError["code"], number> = { FORBIDDEN: 403, NOT_FOUND: 404, ALREADY_LISTED: 409, BAD_INPUT: 400 };

function fail(e: unknown, field?: "userId" | "email") {
  if (e instanceof RecipientError) {
    // docs/08 § Errors: a refusal about the person or address just added belongs to that field.
    const onField = field && (e.code === "ALREADY_LISTED" || (e.code === "NOT_FOUND" && field === "userId")) ? { fields: { [field]: e.message } } : {};
    return NextResponse.json({ error: { code: e.code, message: e.message, ...onField } }, { status: STATUS[e.code] });
  }
  throw e;
}

export async function GET() {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const head = isHeadOfProjects(guard.ctx);
  const [recipients, candidates] = await Promise.all([listRecipients(guard.ctx), head ? listCandidates(guard.ctx) : Promise.resolve([])]);
  return NextResponse.json({ data: { recipients, candidates, canEdit: head, emailEnabled: emailEnabled() } });
}

export async function POST(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const parsed = AddRecipientInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pass a userId or a valid email.");
  try {
    return NextResponse.json({ data: await addRecipient(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    return fail(e, parsed.data.userId ? "userId" : "email");
  }
}

export async function DELETE(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: { code: "VALIDATION", message: "Pass ?id=." } }, { status: 400 });
  try {
    await removeRecipient(guard.ctx, id);
    return NextResponse.json({ data: { removed: true } });
  } catch (e) {
    return fail(e);
  }
}
