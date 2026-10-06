import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { emailEnabled } from "@/server/mail/mailer";
import { isSubscribed, subscribe, unsubscribe } from "@/server/report-subscriptions";

// Milestone B — the viewer's own weekly-report subscription ("Email me weekly"). Session
// only: there is no permission to hold, and the row is always the caller's. `emailEnabled`
// tells the UI whether a subscription can become an email on this deployment at all.

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: { subscribed: await isSubscribed(guard.ctx) }, emailEnabled: emailEnabled() });
}

export async function PUT() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await subscribe(guard.ctx), emailEnabled: emailEnabled() });
}

export async function DELETE() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await unsubscribe(guard.ctx), emailEnabled: emailEnabled() });
}
