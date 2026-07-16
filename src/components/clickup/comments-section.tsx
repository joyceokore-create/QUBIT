"use client";

import { useCallback, useEffect, useState } from "react";

interface CommentNode {
  id: string;
  content: { text?: string } | null;
  author: { id: string; name: string };
  createdAt: string;
  editedAt: string | null;
  reactions: Record<string, string[]>;
  assignedToId: string | null;
  resolvedAt: string | null;
  replies?: CommentNode[];
}

async function jsonFetch(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Threaded task comments with reactions and assigned-comment resolve. */
export function CommentsSection({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [assign, setAssign] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/tasks/${taskId}/comments`);
    if (res.ok) setComments((await res.json()).data ?? []);
  }, [taskId]);

  useEffect(() => {
    void load();
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => setUserId(s?.user?.id ?? null))
      .catch(() => {});
  }, [load]);

  const add = async () => {
    const value = text.trim();
    if (!value) return;
    const res = await jsonFetch(`/api/v1/tasks/${taskId}/comments`, "POST", {
      content: { text: value },
      ...(assign && userId ? { assignedToId: userId } : {}),
    });
    if (res.ok) {
      setText("");
      setAssign(false);
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
        Comments
      </div>

      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} taskId={taskId} userId={userId} onChange={load} />
        ))}
        {comments.length === 0 && <li className="text-[12px] text-[var(--ink5)]">No comments yet.</li>}
      </ul>

      <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--w10)] bg-[var(--card2)] p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a comment…"
          className="resize-y bg-transparent text-[13px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink4)]">
            <input
              type="checkbox"
              checked={assign}
              onChange={(e) => setAssign(e.target.checked)}
              className="size-3.5 accent-[var(--brand)]"
            />
            Assign to me
          </label>
          <button
            type="button"
            onClick={add}
            className="rounded-full bg-[var(--brand)] px-[14px] py-1.5 text-[12px] font-bold text-[var(--onbrand)] hover:-translate-y-px"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  taskId,
  userId,
  onChange,
  isReply,
}: {
  comment: CommentNode;
  taskId: string;
  userId: string | null;
  onChange: () => void;
  isReply?: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");

  const react = async () => {
    const res = await jsonFetch(`/api/v1/comments/${comment.id}/reactions`, "POST", { emoji: "👍" });
    if (res.ok) onChange();
  };
  const resolve = async () => {
    const res = await jsonFetch(`/api/v1/comments/${comment.id}/resolve`, "POST", {
      resolved: !comment.resolvedAt,
    });
    if (res.ok) onChange();
  };
  const sendReply = async () => {
    const value = replyText.trim();
    if (!value) return;
    const res = await jsonFetch(`/api/v1/tasks/${taskId}/comments`, "POST", {
      content: { text: value },
      parentId: comment.id,
    });
    if (res.ok) {
      setReplyText("");
      setReplyOpen(false);
      onChange();
    }
  };

  const thumbs = comment.reactions?.["👍"] ?? [];
  const reactedByMe = userId ? thumbs.includes(userId) : false;

  return (
    <li className={isReply ? "ml-6" : ""}>
      <div className="flex flex-col gap-1 rounded-[10px] border border-[var(--w06)] bg-[var(--card2)] p-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-[var(--qink)]">{comment.author.name}</span>
          <span className="text-[var(--ink5)]">{new Date(comment.createdAt).toLocaleString()}</span>
          {comment.editedAt && <span className="text-[var(--ink5)]">(edited)</span>}
          {comment.assignedToId && (
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${comment.resolvedAt ? "bg-[var(--ok-bg)] text-[var(--ok)]" : "bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-brand"}`}
            >
              {comment.resolvedAt ? "Resolved" : "Assigned"}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-[var(--ink2)]">
          {comment.content?.text ?? ""}
        </p>
        <div className="mt-1 flex items-center gap-3 text-[11.5px]">
          <button
            type="button"
            onClick={react}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${reactedByMe ? "bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-brand" : "text-[var(--ink4)] hover:text-[var(--qink)]"}`}
          >
            👍 {thumbs.length > 0 && thumbs.length}
          </button>
          {!isReply && (
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              className="text-[var(--ink4)] hover:text-[var(--qink)]"
            >
              Reply
            </button>
          )}
          {comment.assignedToId && (
            <button type="button" onClick={resolve} className="text-[var(--ink4)] hover:text-brand">
              {comment.resolvedAt ? "Reopen" : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {replyOpen && (
        <div className="ml-6 mt-2 flex items-center gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Reply…"
            className="flex-1 rounded-[8px] border border-[var(--w10)] bg-[var(--card2)] px-2 py-1.5 text-[12.5px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} taskId={taskId} userId={userId} onChange={onChange} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}
