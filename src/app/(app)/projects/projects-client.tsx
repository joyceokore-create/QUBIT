"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { gateCells, projectRank, statusBarTok, statusMeta } from "@/lib/project-view";

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  type: string;
  priority: string;
  status: string;
  dueDate: string | null;
  budget: string | null;
  avgProgress: number;
  memberCount: number;
  /** The viewer leads this project or is allocated to it — powers the MINE chip. */
  isMine: boolean;
}

const STATUSES = ["Planning", "OnTrack", "AtRisk", "Overdue", "Completed", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const ROW_GRID = "grid grid-cols-[96px_62px_minmax(0,1fr)_130px_90px_60px_24px] items-center gap-3.5";

export function ProjectsClient({
  projects,
  canCreate,
  tenantName,
}: {
  projects: ProjectRow[];
  canCreate: boolean;
  tenantName: string;
}) {
  const { openProject } = usePanel();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);

  // Filter chips: All + each status present in the data, worst-status first, with counts.
  const chips = useMemo(() => {
    const present = Array.from(new Set(projects.map((p) => p.status))).sort((a, b) => projectRank(b) - projectRank(a));
    return [
      { key: "all", label: "ALL", count: projects.length },
      ...present.map((s) => ({ key: s, label: statusMeta(s).label, count: projects.filter((p) => p.status === s).length })),
    ];
  }, [projects]);
  const mineCount = useMemo(() => projects.filter((p) => p.isMine).length, [projects]);

  const filtered = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            (status === "all" || p.status === status) &&
            (!mineOnly || p.isMine) &&
            (q === "" || p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase())),
        )
        .sort((a, b) => projectRank(b.status) - projectRank(a.status) || a.name.localeCompare(b.name)),
    [projects, q, status, mineOnly],
  );

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[22px_24px_90px]">
      <div className="flex items-end justify-between gap-5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div>
          <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
            Portfolio / {tenantName}
          </div>
          <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Projects</h1>
        </div>
        {canCreate && <NewProjectDialog />}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.05s_both]">
        <div className="relative flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink4)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="w-[250px] rounded-[10px] border border-[var(--hair)] bg-[var(--cardbg)] py-[9px] pl-8 pr-3 text-[12.5px] text-[var(--qink)] outline-none backdrop-blur-[var(--glassblur)] focus:border-[color-mix(in_oklab,var(--brand)_50%,transparent)]"
          />
        </div>
        {chips.map((c) => {
          const active = status === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatus(c.key)}
              className="flex items-center gap-1.5 rounded-full border px-[13px] py-[7px] font-mono text-[10px] font-semibold tracking-[1px] transition-colors"
              style={{
                borderColor: active ? "var(--brand)" : "var(--hair)",
                background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink3)",
              }}
            >
              {c.label} <span className="opacity-55">{c.count}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMineOnly((m) => !m)}
          title="Projects you lead or are allocated to"
          className="flex items-center gap-1.5 rounded-full border px-[13px] py-[7px] font-mono text-[10px] font-semibold tracking-[1px] transition-colors"
          style={{
            borderColor: mineOnly ? "var(--brand)" : "var(--hair)",
            background: mineOnly ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
            color: mineOnly ? "var(--brand)" : "var(--ink3)",
          }}
        >
          MINE <span className="opacity-55">{mineCount}</span>
        </button>
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-[1px] text-[var(--ink4)]">{filtered.length} SHOWN</span>
      </div>

      {/* Glass gate-table */}
      <div
        className="overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]"
        style={{ background: "var(--cardbg)" }}
      >
        <div className={`${ROW_GRID} border-b border-[var(--hair)] p-[10px_18px] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
          <span>GATES</span>
          <span>CODE</span>
          <span>PROJECT</span>
          <span>PROGRESS</span>
          <span>STATUS</span>
          <span className="text-right">TEAM</span>
          <span />
        </div>
        {filtered.map((p) => {
          const m = statusMeta(p.status);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => openProject(p.id)}
              className={`${ROW_GRID} w-full border-b border-[var(--hair2)] p-[11px_18px] text-left transition-[transform,background] duration-200 last:border-0 hover:translate-x-[3px] hover:bg-[var(--wash)]`}
            >
              <span className="flex gap-[3px]">
                {gateCells(p.avgProgress, p.status).map((tok, i) => (
                  <span key={i} className="size-2 rounded-[2px]" style={{ background: `var(${tok})` }} />
                ))}
              </span>
              <span className="font-mono text-[10.5px] tracking-[.5px] text-[var(--ink4)]">{p.code}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold tracking-[-.1px] text-[var(--qink)]">{p.name}</span>
                <span className="block truncate text-[11px] text-[var(--ink4)]">{p.type} · {p.priority} priority</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--wash2)]">
                  <span className="block h-full rounded-full" style={{ width: `${p.avgProgress}%`, background: `var(${statusBarTok(p.status)})` }} />
                </span>
                <span className="w-[30px] text-right font-mono text-[10.5px] tabular-nums text-[var(--ink3)]">{p.avgProgress}%</span>
              </span>
              <span
                className="justify-self-start rounded-[5px] p-[3px_7px] font-mono text-[9px] font-semibold tracking-[1px]"
                style={{ color: `var(${m.tok})`, border: `1px solid color-mix(in oklab, var(${m.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${m.tok}) 9%, transparent)` }}
              >
                {m.label}
              </span>
              <span className="text-right font-mono text-[10.5px] text-[var(--ink4)]">{p.memberCount}</span>
              <ChevronRight className="size-3 text-[var(--ink5)]" />
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-10 text-center text-[13px] text-[var(--ink4)]">No projects match your search.</div>
        )}
      </div>
    </main>
  );
}

function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // No code field — codes are auto-generated from the name, unique per tenant (DM1.21).
  const [form, setForm] = useState({ name: "", description: "", type: "Project", priority: "Medium", status: "Planning" });
  // Every project needs a project manager (its lead) — required before create (per Joyce).
  const [leadUserId, setLeadUserId] = useState<string>("");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    fetch("/api/v1/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => {});
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!leadUserId) {
      setError("Choose a project manager — every project needs a lead.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, description: form.description || null, leadUserId }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error?.message ?? "Could not create project.");
      return;
    }
    setOpen(false);
    setForm({ name: "", description: "", type: "Project", priority: "Medium", status: "Planning" });
    setLeadUserId("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="rounded-full shadow-[0_4px_20px_color-mix(in_oklab,var(--brand)_var(--glowA),transparent)]" />}>
        <Plus /> New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create a Riverbank project. Assign resources and teams after.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Name</label>
            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
            <p className="text-xs text-ink-3">The project code is generated from the name.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Description</label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-2">Priority</label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v ?? "Medium")} items={Object.fromEntries(PRIORITIES.map((p) => [p, p]))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-2">Status</label>
              <Select value={form.status} onValueChange={(v) => set("status", v ?? "Planning")} items={Object.fromEntries(STATUSES.map((s) => [s, s]))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Project manager (lead)</label>
            <Select value={leadUserId || undefined} onValueChange={(v) => setLeadUserId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose who runs this project…" /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
