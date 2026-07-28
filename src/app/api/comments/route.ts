import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import {
  COMMENT_ENTITY_TYPES,
  ConversationError,
  listComments,
  postComment,
  PostCommentInput,
} from "@/server/conversation";

// Conversation attached to work (M4). GET ?entityType&entityId lists a thread;
// POST posts a comment or reply. Any authenticated tenant user may read and comment
// (global read, DM1.3 — recorded in DECISIONS.md DM1.26).

const ListQuery = z.object({ entityType: z.enum(COMMENT_ENTITY_TYPES), entityId: z.string().min(1) });

function onError(err: unknown) {
  if (err instanceof ConversationError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
  }
  throw err;
}

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = ListQuery.safeParse({ entityType: url.searchParams.get("entityType"), entityId: url.searchParams.get("entityId") });
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "entityType and entityId are required." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await listComments(ctx, parsed.data.entityType, parsed.data.entityId) });
  } catch (err) {
    return onError(err);
  }
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const parsed = PostCommentInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid comment." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ data: await postComment(ctx, parsed.data) }, { status: 201 });
  } catch (err) {
    return onError(err);
  }
}
