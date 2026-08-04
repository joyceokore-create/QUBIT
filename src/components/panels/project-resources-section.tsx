"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AssignMembersDialog } from "@/components/panels/assign-members-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
  allocationPct: number | null;
}
interface TeamOpt {
  id: string;
  name: string;
}

/** Project resources: allocate people (role + %) and assign teams. Read-only unless canEdit. */
export function ProjectResourcesSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);

  const load = useCallback(async () => {
    const [m, t] = await Promise.all([
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/teams`).then((r) => r.json()),
    ]);
    setMembers(m.data ?? []);
    setAssignedTeamIds((t.data ?? []).map((x: { teamId: string }) => x.teamId));
  }, [projectId]);

  useEffect(() => {
    void load();
    if (canEdit) {
      fetch("/api/teams").then((r) => r.json()).then((d) => setTeams((d.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))).catch(() => {});
    }
  }, [load, canEdit]);

  const removeMember = async (userId: string) => {
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) void load();
  };
  const toggleTeam = async (teamId: string, on: boolean) => {
    const next = on ? [...assignedTeamIds, teamId] : assignedTeamIds.filter((t) => t !== teamId);
    const res = await fetch(`/api/projects/${projectId}/teams`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamIds: next }),
    });
    if (res.ok) setAssignedTeamIds(next);
  };

  const assignedTeamNames = teams.filter((t) => assignedTeamIds.includes(t.id)).map((t) => t.name);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[13px] font-semibold text-foreground">Resources</div>

      {/* Members */}
      <div className="flex flex-col gap-1.5">
        {members.map((m) => (
          <div key={m.userId} className="group flex items-center gap-2 rounded-[6px] bg-background px-3 py-2 text-xs">
            <span className="flex size-6 flex-none items-center justify-center rounded-full text-[9px] font-bold" style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))", color: "var(--qink)" }}>
              {m.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              <span className="font-medium text-foreground">{m.name}</span> · {m.role}
            </span>
            {m.allocationPct != null && <span className="text-ink-3">{m.allocationPct}%</span>}
            {canEdit && (
              <ConfirmDialog
                trigger={
                  <button type="button" className="text-ink-3 opacity-0 hover:text-status-red group-hover:opacity-100" aria-label="Remove">
                    <X className="size-3.5" />
                  </button>
                }
                title="Remove from project?"
                description={`${m.name} will lose access to this project’s workspace.`}
                confirmLabel="Remove"
                onConfirm={() => removeMember(m.userId)}
              />
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-ink-3">No people allocated yet.</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          {/* M-P1d: the bare add-row became the capacity-aware assign panel — bulk pick,
              load + leave surfaced, warnings audited (docs/26 §4.3). */}
          <AssignMembersDialog
            projectId={projectId}
            existingUserIds={members.map((m) => m.userId)}
            onDone={() => void load()}
          />
        </div>
      )}

      {/* Teams */}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[.5px] text-ink-3">Teams</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignedTeamNames.map((n) => (
            <span key={n} className="rounded-full bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-brand">
              {n}
            </span>
          ))}
          {assignedTeamNames.length === 0 && <span className="text-xs text-ink-3">None</span>}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-full border border-dashed border-ink-4 px-2 py-0.5 text-[11px] text-ink-3 hover:border-brand hover:text-brand">
                <Plus className="size-3" /> Assign
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[260px] overflow-y-auto">
                <DropdownMenuLabel>Teams</DropdownMenuLabel>
                {teams.map((t) => (
                  <DropdownMenuCheckboxItem key={t.id} checked={assignedTeamIds.includes(t.id)} onCheckedChange={(on) => toggleTeam(t.id, on)}>
                    {t.name}
                  </DropdownMenuCheckboxItem>
                ))}
                {teams.length === 0 && <DropdownMenuLabel>No teams yet</DropdownMenuLabel>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
