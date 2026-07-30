"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LESSON_CATEGORIES, LESSON_LABELS, type LessonCategory, type LessonRow } from "@/server/lessons";

// Lessons learned (docs/16 §6). Captured while the project runs — the closure gate asks
// for at least one, and a lesson written six months late is a lesson nobody learned.

const CATEGORY_TOK: Record<LessonCategory, string> = {
  WhatWentWell: "--ok",
  WhatDidNot: "--bad",
  Recommendation: "--qinfo",
};

interface Serialized extends Omit<LessonRow, "createdAt"> {
  createdAt: string;
}

export function LessonsCard({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Serialized[] | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LessonCategory>("Recommendation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/lessons`);
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { data: Serialized[]; canAdd: boolean };
      setRows(json.data);
      setCanAdd(json.canAdd);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const add = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/lessons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), category }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not save.");
    } else {
      setRows(((await res.json()) as { data: Serialized[] }).data);
      setTitle("");
      setOpen(false);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">
          Lessons learned
        </span>
        {rows && <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">{rows.length}</span>}
        {canAdd && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[.6px] text-[var(--ink4)] hover:text-[var(--qink)]"
          >
            <Plus className="size-3" /> Add
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="What should the next project know?"
            className="h-8 rounded-[8px] border border-[var(--w07)] bg-[var(--wash)] px-2.5 text-[12px] text-[var(--ink2)] outline-none focus:border-[var(--brand)]"
          />
          <div className="flex items-center gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as LessonCategory)}>
              <SelectTrigger className="h-7 w-[150px] text-[11px]" aria-label="Lesson category">
                <SelectValue>{LESSON_LABELS[category]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LESSON_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {LESSON_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || title.trim().length < 3}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3 animate-spin" />} Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11.5px] font-semibold text-[var(--ink4)] hover:text-[var(--qink)]"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
        </div>
      )}

      {!rows ? (
        <p className="flex items-center gap-2 text-[11.5px] text-[var(--ink5)]">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[11.5px] text-[var(--ink5)]">
          Nothing captured yet — the closure gate asks for at least one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((l) => (
            <li key={l.id} className="flex items-start gap-2">
              <span
                className="mt-[3px] w-[3px] flex-none self-stretch rounded-[2px]"
                style={{ background: `var(${CATEGORY_TOK[l.category]})` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{l.title}</span>
                <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
                  {LESSON_LABELS[l.category]}
                  {l.authorName ? ` · ${l.authorName}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
