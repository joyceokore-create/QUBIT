import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { emailEnabled } from "@/server/mail/mailer";
import { SetPreferenceInput, listMyPreferences, setMyPreference } from "@/server/mail/preferences";

// GET/PUT /api/me/notification-preferences — my own routing matrix (docs/16 §8).
// Always MINE: there is no userId in the path, so nobody can reroute a colleague's mail.
// `emailEnabled` is reported so the UI can say "email is off for this deployment"
// instead of pretending a Digest choice sends something.

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({
    data: await listMyPreferences(guard.ctx),
    emailEnabled: emailEnabled(),
  });
}

export async function PUT(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const parsed = SetPreferenceInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid preference." } }, { status: 400 });
  }
  return NextResponse.json({
    data: await setMyPreference(guard.ctx, parsed.data),
    emailEnabled: emailEnabled(),
  });
}
