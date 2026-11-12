"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { AtSign, CornerDownRight, Gavel, Send, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError, type FieldErrors } from "@/lib/form-errors";
import { CommentFormSchema, PromoteFormSchema } from "@/lib/comment-schema";

// Conversation attached to work (M4, docs/16 §4): one-level threads, @mentions
// (notification now, email with M5), promote-to-Decision for PMs. Mounted on projects,
// board cards, risks and documents — same component everywhere.

export interface CommentJson {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  mentions: { id: string; name: string }[];
  decisionId: string | null;
  createdAt: string;
  replies: CommentJson[];
}

interface Person {
  id: string;
  name: string;
}

interface Props {
  entityType: "project" | "project_task" | "risk" | "project_document";
  entityId: string;
  viewerId: string;
  /** PM-level on this project — shows promote + moderation delete. */
  canPromote: boolean;
  /** Compact spacing for drawers. */
  compact?: boolean;
}

function Composer({
  placeholder,
  onPost,
  busy,
}: {
  placeholder: string;
  onPost: (body: string, mentionUserIds: string[]) => Promise<{ ok: true } | { ok: false; fields: FieldErrors }>;
  busy: boolean;
}) {
  const [body, setBody] = useState("");
  // docs/08 § Errors: an empty comment shows its problem on the box; Post stays enabled.
  const fe = useFieldErrors({ schema: CommentFormSchema, values: { body }, idPrefix: useId() });
  const [mentions, setMentions] = useState<Person[]>([]);
  const [people, setPeople] = useState<Person[] | null>(null);

  const loadPeople = async () => {
    if (people) return;
    const d = await fetch("/api/users").then((r) => r.json()).catch(() => null);
    setPeople(d?.data ?? []);
  };

  const addMention = (p: Person) => {
    if (!mentions.some((m) => m.id === p.id)) {
      setMentions((prev) => [...prev, p]);
      setBody((prev) => `${prev}${prev.endsWith(" ") || prev === "" ? "" : " "}@${p.name} `);
    }
  };

  const post = async () => {
    if (!fe.validate()) return;
    const out = await onPost(body.trim(), mentions.map((m) => m.id));
    if (out.ok) {
      setBody("");
      setMentions([]);
      fe.reset();
    } else if (out.fields.body) fe.setServerErrors({ body: out.fields.body });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        {...fe.bind("body")}
        aria-label={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="resize-none rounded-[8px] border border-ink-4 bg-background p-2.5 text-xs text-foreground outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none aria-invalid:border-[var(--ds-bad)] aria-invalid:focus:border-[var(--ds-bad)] aria-invalid:focus:ring-[var(--ds-bad)]"
      />
      {fe.errors.body && <FieldError id={`${fe.idOf("body")}-error`}>{fe.errors.body}</FieldError>}
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            onMouseEnter={() => void loadPeople()}
            onFocus={() => void loadPeople()}
            className="flex items-center gap-1 rounded-[7px] border border-[var(--w07)] px-2 py-1 text-[10.5px] font-semibold text-[var(--ink3)] transition-colors hover:text-[var(--qink)]"
          >
            <AtSign className="size-3" /> Mention
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[220px] overflow-y-auto">
            {(people ?? []).map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => addMention(p)}>
                {p.name}
              </DropdownMenuItem>
            ))}
            {people?.length === 0 && <DropdownMenuItem disabled>No people found</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        {mentions.map((m) => (
          <span key={m.id} className="flex items-center gap-1 rounded-full bg-[var(--wash2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink2)]">
            @{m.name}
            <button type="button" aria-label={`Remove mention of ${m.name}`} onClick={() => setMentions((prev) => prev.filter((x) => x.id !== m.id))}>
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => void post()}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11px] font-bold text-[var(--onbrand)] disabled:opacity-50"
        >
          <Send className="size-3" /> Post
        </button>
      </div>
    </div>
  );
}

export function CommentsSection({ entityType, entityId, viewerId, canPromote, compact }: Props) {
  const [comments, setComments] = useState<CommentJson[]>([]);
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [promoteFor, setPromoteFor] = useState<CommentJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`).then((r) => r.json()).catch(() => null);
    setComments(d?.data ?? []);
  }, [entityType, entityId]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: string, mentionUserIds: string[], parentId?: string): Promise<{ ok: true } | { ok: false; fields: FieldErrors }> => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType, entityId, body, mentionUserIds, parentId: parentId ?? null }),
    });
    setBusy(false);
    if (res.ok) {
      setReplyTo(null);
      void load();
      return { ok: true };
    }
    const { message, fields } = readApiError(await res.json().catch(() => null), "Could not post the comment.");
    // A problem with the text itself goes on the box; anything else is the banner above it.
    if (!fields.body) setError(message);
    return { ok: false, fields };
  };

  const remove = async (id: string) => {
    await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => {});
    void load();
  };

  const highlightMentions = (body: string) =>
    body.split(/(@[\p{L}\p{N}. '-]+)/u).map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="font-semibold text-[var(--brand)]">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );

  const CommentRow = ({ c, isReply }: { c: CommentJson; isReply?: boolean }) => (
    <div className={`flex flex-col gap-1 rounded-[10px] border border-[var(--w06)] bg-[var(--qcard)] p-2.5 ${isReply ? "ml-6" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11.5px] font-bold text-[var(--qink)]">{c.authorName}</span>
        <span className="text-[9.5px] text-[var(--ink5)]">{new Date(c.createdAt).toLocaleString()}</span>
        {c.decisionId && (
          <span className="flex items-center gap-1 rounded-[5px] border border-[var(--ok)]/40 bg-[var(--ok)]/10 px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--ok)]">
            <Gavel className="size-2.5" /> Decision
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {!isReply && (
            <button type="button" title="Reply" aria-label="Reply" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="rounded p-1 text-[var(--ink4)] hover:text-[var(--qink)]">
              <CornerDownRight className="size-3" />
            </button>
          )}
          {canPromote && !c.decisionId && (
            <button type="button" title="Promote to decision" aria-label="Promote to decision" onClick={() => setPromoteFor(c)} className="rounded p-1 text-[var(--ink4)] hover:text-[var(--qink)]">
              <Gavel className="size-3" />
            </button>
          )}
          {(c.authorId === viewerId || canPromote) && (
            <button type="button" title="Delete" aria-label="Delete comment" onClick={() => void remove(c.id)} className="rounded p-1 text-[var(--ink4)] hover:text-[var(--bad)]">
              <Trash2 className="size-3" />
            </button>
          )}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[12px] leading-[1.5] text-[var(--ink2)]">{highlightMentions(c.body)}</p>
      {c.replies.map((r) => (
        <CommentRow key={r.id} c={r} isReply />
      ))}
      {replyTo === c.id && (
        <div className="ml-6 mt-1">
          <Composer placeholder={`Reply to ${c.authorName}…`} busy={busy} onPost={(b, m) => post(b, m, c.id)} />
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      {!compact && <h2 className="text-[15px] rv:text-heading-xs font-bold text-[var(--qink)]">Discussion</h2>}
      {error && <Banner tone="bad">{error}</Banner>}
      <Composer placeholder="Start the discussion — @mention someone to pull them in…" busy={busy} onPost={(b, m) => post(b, m)} />
      <div className="flex flex-col gap-2">
        {comments.map((c) => (
          <CommentRow key={c.id} c={c} />
        ))}
        {comments.length === 0 && <p className="text-xs text-ink-3">No comments yet — be the first.</p>}
      </div>

      <Dialog open={!!promoteFor} onOpenChange={(o) => !o && setPromoteFor(null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Record a decision</DialogTitle>
          </DialogHeader>
          {promoteFor && (
            <PromoteForm
              comment={promoteFor}
              onDone={() => {
                setPromoteFor(null);
                void load();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromoteForm({ comment, onDone }: { comment: CommentJson; onDone: () => void }) {
  const [title, setTitle] = useState(comment.body.slice(0, 120));
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fe = useFieldErrors({ schema: PromoteFormSchema, values: { title, rationale }, idPrefix: "promote" });

  const promote = async () => {
    setError(null);
    if (!fe.validate()) return;
    setBusy(true);
    const res = await fetch(`/api/comments/${comment.id}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), rationale: rationale.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not record the decision.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields, ["title", "rationale"]);
        if (root) setError(root);
      } else setError(message);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {error && <Banner tone="bad">{error}</Banner>}
      <Field label="What Was Decided?" htmlFor={fe.idOf("title")} error={fe.errors.title}>
        <input
          {...fe.bind("title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-[8px] border border-ink-4 bg-background px-2.5 py-2 text-xs font-normal text-foreground outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none aria-invalid:border-[var(--ds-bad)] aria-invalid:focus:border-[var(--ds-bad)] aria-invalid:focus:ring-[var(--ds-bad)]"
        />
      </Field>
      <Field label="Why? (Defaults to the Comment)" htmlFor={fe.idOf("rationale")} error={fe.errors.rationale}>
        <textarea
          {...fe.bind("rationale")}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          className="resize-none rounded-[8px] border border-ink-4 bg-background p-2.5 text-xs font-normal text-foreground outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none aria-invalid:border-[var(--ds-bad)] aria-invalid:focus:border-[var(--ds-bad)] aria-invalid:focus:ring-[var(--ds-bad)]"
        />
      </Field>
      <button
        type="button"
        onClick={() => void promote()}
        disabled={busy}
        className="flex items-center justify-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3.5 py-2 text-xs font-bold text-[var(--onbrand)] disabled:opacity-50"
      >
        <Gavel className="size-3.5" /> {busy ? "Recording…" : "Record decision"}
      </button>
    </div>
  );
}
