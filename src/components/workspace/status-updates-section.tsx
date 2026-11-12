"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusUpdateFormSchema } from "@/lib/workspace-schema";
import { readApiError } from "@/lib/form-errors";
import { FieldError } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPACT_PRIMARY, FIELD_INVALID, RAG_TOKEN } from "@/lib/surface";

interface Update {
  id: string;
  body: string;
  rag: string;
  postedByName: string | null;
  createdAt: string;
}

export function StatusUpdatesSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [body, setBody] = useState("");
  const [rag, setRag] = useState("Green");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // docs/08 § Errors: the update's problem shows on the field; Post stays enabled except while sending.
  const fe = useFieldErrors({ schema: StatusUpdateFormSchema, values: { body }, idPrefix: "status-update" });

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/status-updates`).then((r) => r.json());
    setUpdates(d.data ?? []);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async () => {
    setError(null);
    if (!fe.validate()) return;
    setPosting(true);
    const res = await fetch(`/api/projects/${projectId}/status-updates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: body.trim(), rag }),
    }).catch(() => null);
    setPosting(false);
    if (res?.ok) {
      setBody("");
      setRag("Green");
      fe.reset();
      void load();
      return;
    }
    const { message, fields } = readApiError(await res?.json().catch(() => null), "Could not post the update. Try again.");
    if (fields.body) fe.setServerErrors({ body: fields.body });
    else setError(message);
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[15px] rv:text-heading-xs font-bold text-[var(--qink)]">Status updates</h2>

      {canEdit && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)] p-3">
          <textarea
            {...fe.bind("body")}
            aria-label="Status update"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Post an update — the project's managers and testers get notified…"
            className={`resize-none rounded-[8px] border border-ink-4 bg-background p-2.5 text-xs text-foreground outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none ${FIELD_INVALID}`}
          />
          {fe.errors.body && <FieldError id={`${fe.idOf("body")}-error`}>{fe.errors.body}</FieldError>}
          <div className="flex items-center gap-2">
            <Select value={rag} onValueChange={(v) => v && setRag(v)} items={{ Green: "Green", Amber: "Amber", Red: "Red" }}>
              <SelectTrigger className="h-8 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Green", "Amber", "Red"] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    <span className="mr-2 inline-block size-2 flex-none rounded-full align-middle" style={{ background: `var(${RAG_TOKEN[r]})` }} />
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p role="alert" className="ml-auto text-[11.5px] text-[var(--bad)]">{error}</p>}
            <button
              type="button"
              onClick={post}
              disabled={posting}
              className={`${error ? "" : "ml-auto "}${COMPACT_PRIMARY}`}
            >
              <Send className="size-3.5" /> {posting ? "Posting…" : "Post Update"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {updates.map((u) => (
          <div key={u.id} className="flex gap-2.5 rounded-[10px] border border-[var(--w06)] bg-[var(--qcard)] p-3">
            <span className="mt-1 size-2.5 flex-none rounded-full" style={{ background: `var(${RAG_TOKEN[u.rag] ?? "--ink4"})` }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-[1.5] text-[var(--ink2)]">{u.body}</p>
              <p className="mt-1 text-[10.5px] text-[var(--ink5)]">
                {u.postedByName ?? "Someone"} · {new Date(u.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {updates.length === 0 && <p className="text-xs text-ink-3">No status updates yet.</p>}
      </div>
    </div>
  );
}
