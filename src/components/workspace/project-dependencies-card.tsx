"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { RAG_TOKEN as RAG_TOK } from "@/lib/surface";

// M-P2c (docs/33) — the workspace "waits on / blocks" card. Declaring a dependency is
// PM/Head territory (the route's engine enforces it); everyone reads both directions.

interface Ref {
  projectId: string;
  code: string;
  name: string;
  status: string;
  rag: "Green" | "Amber" | "Red";
  note: string | null;
}
interface ProjectOpt {
  id: string;
  code: string;
  name: string;
}

export function ProjectDependenciesCard({
  projectId,
  canEdit,
  projects,
}: {
  projectId: string;
  canEdit: boolean;
  /** Candidates for the add select (all other projects) — server-provided. */
  projects: ProjectOpt[];
}) {
  const [waitsOn, setWaitsOn] = useState<Ref[]>([]);
  const [blocks, setBlocks] = useState<Ref[]>([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/dependencies`).then((r) => r.json());
    setWaitsOn(d.waitsOn ?? []);
    setBlocks(d.blocks ?? []);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!pick) return;
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dependsOnProjectId: pick, note: note.trim() || undefined }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not add.");
      return;
    }
    setAdding(false);
    setPick("");
    setNote("");
    void load();
  }
  async function remove(dependsOn: string) {
    const res = await fetch(`/api/projects/${projectId}/dependencies?dependsOn=${dependsOn}`, { method: "DELETE" });
    if (res.ok) void load();
  }

  const Row = ({ r, removable }: { r: Ref; removable: boolean }) => (
    <div className="group flex items-center gap-2 py-1 text-xs">
      <span className="size-2 flex-none rounded-full" style={{ background: `var(${RAG_TOK[r.rag]})` }} />
      <Link href={`/projects/${r.projectId}`} className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-brand">
        {r.code} · {r.name}
      </Link>
      {r.note && <span className="hidden max-w-[140px] truncate text-[10px] text-ink-3 sm:block">{r.note}</span>}
      {removable && (
        <button
          type="button"
          onClick={() => void remove(r.projectId)}
          className="text-ink-3 opacity-0 transition-opacity hover:text-status-red group-hover:opacity-100"
          aria-label={`Remove dependency on ${r.code}`}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );

  const candidates = projects.filter(
    (p) => p.id !== projectId && !waitsOn.some((w) => w.projectId === p.id),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">Cross-project dependencies</span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-ink-3 hover:text-brand"
          >
            <Plus className="size-3" /> Add
          </button>
        )}
      </div>

      <div>
        <div className="text-[9.5px] font-bold tracking-[0.8px] text-ink-3 uppercase">Waits on</div>
        {waitsOn.length === 0 && <p className="py-1 text-[11px] text-ink-3">Nothing — this project moves on its own.</p>}
        {waitsOn.map((r) => (
          <Row key={r.projectId} r={r} removable={canEdit} />
        ))}
      </div>
      {blocks.length > 0 && (
        <div>
          <div className="text-[9.5px] font-bold tracking-[0.8px] text-ink-3 uppercase">Blocks</div>
          {blocks.map((r) => (
            <Row key={r.projectId} r={r} removable={false} />
          ))}
        </div>
      )}

      {adding && (
        <div className="flex flex-col gap-1.5 rounded-[8px] border border-[var(--w08)] p-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="">— waits on which project? —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? e.g. UAT waits on their API (optional)"
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
          />
          {error && <p className="text-[11px] text-status-red">{error}</p>}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void add()} disabled={!pick} className="rounded-[7px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-brand disabled:opacity-40">
              Add dependency
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="px-2 py-1 text-[11px] text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
