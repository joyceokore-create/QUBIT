import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runJob, getJob } from "@/server/jobs";

// Machine-to-machine only: the box's crontab hits this route (DM1.15 №4 — no queue
// sidecar). Guarded by CRON_SECRET, compared timing-safe. Node runtime: jobs use pg.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CronBody = z.object({
  job: z.string().min(1),
  /** Optional explicit idempotency key; defaults to one per job per UTC day. */
  key: z.string().min(1).max(200).optional(),
});

function secretMatches(provided: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !provided) return false;
  // Hash both sides to equal length so timingSafeEqual never throws on length mismatch.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!secretMatches(provided)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = CronBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { job, key? }." }, { status: 422 });
  }
  const { job, key } = parsed.data;
  if (!getJob(job)) {
    return NextResponse.json({ error: `Unknown job "${job}".` }, { status: 404 });
  }

  const idempotencyKey = key ?? `${job}:${new Date().toISOString().slice(0, 10)}`;
  const result = await runJob(job, idempotencyKey);
  return NextResponse.json(result, { status: 200 });
}
