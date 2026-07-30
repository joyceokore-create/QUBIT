"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, FileText, MessageSquare, Plus, Sparkles, Trash2 } from "lucide-react";
import { ConversationDrawer } from "@/components/conversation/conversation-drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/q/markdown";

interface Approval {
  approverId: string;
  approverName: string;
  decision: "Pending" | "Approved" | "Rejected";
  comment: string | null;
}
interface Doc {
  id: string;
  title: string;
  kind: string;
  format: string;
  status: string;
  source: string;
  authorName: string | null;
  hasFile: boolean;
  createdAt: string;
  version: number;
  superseded: boolean;
  approvals: Approval[];
}
interface DocDetail extends Doc {
  content: string | null;
  fileData: string | null;
}

// docs/16 §6 — the register's real types and its review vocabulary.
const KINDS = ["BRD", "URS", "SRS", "Design", "TestPlan", "Signoff", "Handover", "Plan", "Note", "Other"] as const;
const STATUS_TOKEN: Record<string, string> = { Draft: "--ink4", InReview: "--warn", Approved: "--ok", Rejected: "--bad" };
const STATUS_LABEL: Record<string, string> = { Draft: "Draft", InReview: "In review", Approved: "Approved", Rejected: "Sent back" };

export function DocumentsSection({
  projectId,
  canEdit,
  viewerId = "",
}: {
  projectId: string;
  canEdit: boolean;
  viewerId?: string;
}) {
  const [discussDoc, setDiscussDoc] = useState<{ id: string; title: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<DocDetail | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [submitFor, setSubmitFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/documents`).then((r) => r.json());
    setDocs(d.data ?? []);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  // Approvers are picked from the project's own team.
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/projects/${projectId}/members`).then((x) => (x.ok ? x.json() : null));
      if (r?.data) setMembers(r.data.map((m: { userId: string; name: string }) => ({ id: m.userId, name: m.name })));
    })();
  }, [projectId]);

  const open = async (id: string) => {
    const d = await fetch(`/api/documents/${id}`).then((r) => r.json());
    if (d.document) setView(d.document);
  };
  const remove = async (id: string) => {
    if (await fetch(`/api/documents/${id}`, { method: "DELETE" }).then((r) => r.ok)) void load();
  };
  // docs/16 §6 — a document is approved by its NAMED approvers, never by a one-click
  // status flip. Submitting names them; deciding is the approver's own act.
  const submit = async (id: string, approverIds: string[]) => {
    const res = await fetch(`/api/documents/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approverIds }),
    });
    if (res.ok) void load();
    else setError((await res.json().catch(() => null))?.error?.message ?? "Could not submit.");
  };
  const decide = async (id: string, decision: "Approved" | "Rejected") => {
    const res = await fetch(`/api/documents/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (res.ok) void load();
    else setError((await res.json().catch(() => null))?.error?.message ?? "Could not record that.");
  };
  const raiseVersion = async (id: string) => {
    const res = await fetch(`/api/documents/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newVersion: true }),
    });
    if (res.ok) void load();
  };
  const draftBrd = async () => {
    setDrafting(true);
    const ok = await fetch(`/api/projects/${projectId}/documents/draft-brd`, { method: "POST" }).then((r) => r.ok);
    setDrafting(false);
    if (ok) void load();
  };

  return (
    <div className="flex flex-col gap-3">
      <ConversationDrawer
        open={!!discussDoc}
        onOpenChange={(o) => !o && setDiscussDoc(null)}
        title={discussDoc?.title ?? ""}
        entityType="project_document"
        entityId={discussDoc?.id ?? null}
        viewerId={viewerId}
        canPromote={canEdit}
      />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] rv:text-heading-xs font-bold text-[var(--qink)]">Documents</h2>
          <p className="text-[11.5px] text-[var(--ink4)]">BRDs, plans and specs attached to this project.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={draftBrd} disabled={drafting}>
              <Sparkles className="size-4" /> {drafting ? "Drafting…" : "Draft BRD with Q"}
            </Button>
            <Button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add document
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {docs.map((d) => (
          <div key={d.id} className="flex flex-col gap-2">
          <div className="group flex items-center gap-3 rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)] p-3">
            <span className="flex size-9 flex-none items-center justify-center rounded-[9px] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-brand">
              <FileText className="size-4" />
            </span>
            <button type="button" onClick={() => open(d.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]">{d.title}</span>
              <span className="block truncate text-[11px] text-[var(--ink4)]">
                {d.kind} · v{d.version}
                {d.superseded ? " · superseded" : ""} · {d.source === "AIDrafted" ? "Q-drafted" : "Uploaded"}
                {d.authorName ? ` · ${d.authorName}` : ""} · {new Date(d.createdAt).toLocaleDateString()}
                {d.status === "InReview" && d.approvals.length > 0
                  ? ` · ${d.approvals.filter((a) => a.decision === "Approved").length}/${d.approvals.length} approved`
                  : ""}
              </span>
            </button>
            <span
              className="flex-none rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ color: `var(${STATUS_TOKEN[d.status] ?? "--ink4"})`, background: `color-mix(in oklab, var(${STATUS_TOKEN[d.status] ?? "--ink4"}) 14%, transparent)` }}
            >
              {STATUS_LABEL[d.status] ?? d.status}
            </span>
            <button
              type="button"
              onClick={() => setDiscussDoc({ id: d.id, title: d.title })}
              title="Discuss this document"
              aria-label="Discuss this document"
              className="flex-none rounded p-1 text-[var(--ink4)] transition-colors hover:text-brand"
            >
              <MessageSquare className="size-3.5" />
            </button>
            {/* I am a named approver on a document in review — my decision, my act. */}
            {d.status === "InReview" && d.approvals.some((a) => a.approverId === viewerId && a.decision === "Pending") && (
              <>
                <button type="button" onClick={() => decide(d.id, "Approved")} className="flex flex-none items-center gap-1 rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-ink-3 hover:border-[var(--ok)] hover:text-[var(--ok)]">
                  <Check className="size-3.5" /> Approve
                </button>
                <button type="button" onClick={() => decide(d.id, "Rejected")} className="flex-none rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-ink-3 hover:border-[var(--bad)] hover:text-[var(--bad)]">
                  Send back
                </button>
              </>
            )}
            {canEdit && (d.status === "Draft" || d.status === "Rejected") && members.length > 0 && (
              <button type="button" onClick={() => setSubmitFor(submitFor === d.id ? null : d.id)} className="flex-none rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-ink-3 hover:border-[var(--brand)] hover:text-brand">
                Submit for review
              </button>
            )}
            {canEdit && d.status === "Approved" && !d.superseded && (
              <button type="button" onClick={() => void raiseVersion(d.id)} title="Raise the next version" className="flex-none rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-ink-3 hover:border-[var(--brand)] hover:text-brand">
                New version
              </button>
            )}
            {canEdit && (
              <ConfirmDialog
                trigger={
                  <button type="button" className="flex-none text-ink-3 opacity-0 hover:text-status-red group-hover:opacity-100" aria-label="Delete document">
                    <Trash2 className="size-4" />
                  </button>
                }
                title="Delete document?"
                description={`“${d.title}” will be removed from this project. This can’t be undone.`}
                onConfirm={() => remove(d.id)}
              />
            )}
          </div>
          {/* Naming the approvers (docs/16 §6) — pick from the project's own team. */}
          {submitFor === d.id && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-[var(--w07)] bg-[var(--wash)] p-2.5">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                Send to
              </span>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    void submit(d.id, [m.id]);
                    setSubmitFor(null);
                  }}
                  className="rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-ink-3 hover:border-[var(--brand)] hover:text-brand"
                >
                  {m.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSubmitFor(null)}
                className="ml-auto text-[10.5px] font-semibold text-[var(--ink4)] hover:text-[var(--qink)]"
              >
                Cancel
              </button>
            </div>
          )}
          </div>
        ))}
        {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}
        {docs.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-[var(--w10)] p-8 text-center text-[13px] text-[var(--ink4)]">
            No documents yet.{canEdit ? " Add a BRD, plan or spec." : ""}
          </div>
        )}
      </div>

      {addOpen && <AddDialog projectId={projectId} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void load(); }} />}
      {view && <ViewDialog doc={view} onClose={() => setView(null)} />}
    </div>
  );
}

function AddDialog({ projectId, onClose, onAdded }: { projectId: string; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("BRD");
  const [content, setContent] = useState("");
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    setFileData(btoa(binary));
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
  }

  async function save() {
    setError(null);
    if (!title.trim() || (!content.trim() && !fileData)) {
      setError("Give it a title and either text or a PDF.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        kind,
        content: content.trim() || null,
        fileData,
        format: fileData ? "pdf" : "markdown",
      }),
    });
    setSaving(false);
    if (res.ok) onAdded();
    else setError((await res.json().catch(() => null))?.error?.message ?? "Could not save.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>Paste the text (recommended — Q can read it) or attach a PDF.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Field Sales BRD" className="flex-1" />
            <Select value={kind} onValueChange={(v) => v && setKind(v)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Paste document text / markdown here…"
            className="rounded-[10px] border border-ink-4 bg-background p-3 text-xs text-foreground outline-none focus:border-brand"
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-3">
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="rounded-[8px] border border-dashed border-ink-4 px-3 py-1.5 hover:border-brand hover:text-brand">
              {fileName ? `📄 ${fileName}` : "Attach a PDF instead (optional)"}
            </span>
          </label>
          {error && <p className="text-xs text-status-red">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save document"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ doc, onClose }: { doc: DocDetail; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>{doc.kind} · {doc.status === "PendingReview" ? "Pending review" : doc.status}</DialogDescription>
        </DialogHeader>
        {doc.format === "pdf" && doc.fileData ? (
          <a
            href={`data:application/pdf;base64,${doc.fileData}`}
            download={`${doc.title}.pdf`}
            className="flex w-fit items-center gap-2 rounded-[10px] bg-[var(--brand)] px-4 py-2.5 text-[13px] font-bold text-[var(--onbrand)]"
          >
            <Download className="size-4" /> Download PDF
          </a>
        ) : doc.content ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-[10px] border border-[var(--w07)] bg-[var(--qcard)] p-4">
            <Markdown text={doc.content} />
          </div>
        ) : (
          <p className="text-sm text-ink-3">This document has no readable content.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
