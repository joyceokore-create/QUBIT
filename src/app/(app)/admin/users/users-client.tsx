"use client";

import { useMemo, useState } from "react";
import type { AdminUserSummary } from "@/server/users";
import type { DepartmentSummary } from "@/server/departments";
import { UserRowActions } from "./user-row-actions";

export interface AdminInsight {
  text: string;
  color: "amber" | "blue" | "green" | "red";
}
const DOT: Record<AdminInsight["color"], string> = { amber: "--warn", blue: "--qinfo", green: "--ok", red: "--bad" };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// Onboarding is "complete" when a user has signed in, enabled MFA, and been placed on a
// team or project. Each step is a dot in the directory + a filter in the overview strip.
function steps(u: AdminUserSummary) {
  return {
    signedIn: u.lastLoginAt !== null,
    mfa: u.mfaEnabled,
    placed: u.teamCount + u.projectCount > 0,
  };
}

type Segment = "all" | "invited" | "nomfa" | "unassigned" | "suspended";
const ROW_GRID = "grid grid-cols-[minmax(0,1.6fr)_170px_120px_86px_30px] items-center gap-3.5";
const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export function UsersClient({
  users,
  departments,
  currentUserId,
  insights,
  canManage,
}: {
  users: AdminUserSummary[];
  departments: DepartmentSummary[];
  currentUserId: string;
  insights: AdminInsight[];
  /** Full user CRUD (roles/suspend/delete) — PlatformSuperAdmin only. Heads see a read-only
   * directory (the row-action menu collapses to department membership). */
  canManage: boolean;
}) {
  const [seg, setSeg] = useState<Segment>("all");

  const counts = useMemo(() => {
    const active = users.filter((u) => u.status === "ACTIVE");
    return {
      all: users.length,
      invited: active.filter((u) => !u.lastLoginAt).length,
      nomfa: active.filter((u) => !u.mfaEnabled).length,
      unassigned: active.filter((u) => u.teamCount + u.projectCount === 0).length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
      onboarded: active.filter((u) => u.lastLoginAt && u.mfaEnabled && u.teamCount + u.projectCount > 0).length,
    };
  }, [users]);

  const rows = useMemo(() => {
    const active = (u: AdminUserSummary) => u.status === "ACTIVE";
    switch (seg) {
      case "invited": return users.filter((u) => active(u) && !u.lastLoginAt);
      case "nomfa": return users.filter((u) => active(u) && !u.mfaEnabled);
      case "unassigned": return users.filter((u) => active(u) && u.teamCount + u.projectCount === 0);
      case "suspended": return users.filter((u) => u.status === "SUSPENDED");
      default: return users;
    }
  }, [users, seg]);

  const tiles: { key: Segment; label: string; value: number; token: string }[] = [
    { key: "all", label: "All users", value: counts.all, token: "--qink" },
    { key: "invited", label: "Never signed in", value: counts.invited, token: "--warn" },
    { key: "nomfa", label: "No MFA", value: counts.nomfa, token: "--bad" },
    { key: "unassigned", label: "Unassigned", value: counts.unassigned, token: "--qinfo" },
    { key: "suspended", label: "Suspended", value: counts.suspended, token: "--ink4" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Onboarding overview — each tile filters the directory */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        <div className={`${CARD} p-[14px_16px]`} style={{ background: "radial-gradient(300px 120px at 50% -40%, color-mix(in oklab, var(--ok) 16%, transparent), transparent 65%), var(--cardbg)" }}>
          <div className="font-heading text-[24px] font-bold tabular-nums text-[var(--ok)]">{counts.onboarded}</div>
          <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">Fully onboarded</div>
        </div>
        {tiles.map((t) => {
          const active = seg === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSeg(t.key)}
              className={`${CARD} p-[14px_16px] text-left transition-colors`}
              style={{ borderColor: active ? "var(--brand)" : "var(--cardbd)", background: active ? "color-mix(in oklab, var(--brand) 8%, transparent)" : "var(--cardbg)" }}
            >
              <div className="font-heading text-[24px] font-bold tabular-nums" style={{ color: `var(${t.token})` }}>{t.value}</div>
              <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{t.label}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.12s_both]">
        {/* Directory */}
        <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
          <div className="flex items-center gap-3.5 border-b border-[var(--hair)] p-[13px_18px]">
            <span className="font-heading text-[14px] font-bold text-[var(--qink)]">Directory</span>
            <span className="font-mono text-[10px] tracking-[1px] text-[var(--ink4)]">
              {rows.length} {rows.length === 1 ? "USER" : "USERS"}{seg !== "all" ? ` · ${tiles.find((t) => t.key === seg)?.label.toUpperCase()}` : ""}
            </span>
            <span className="flex-1" />
            {seg === "all" ? (
              <span className="hidden font-mono text-[9px] tracking-[.8px] text-[var(--ink4)] sm:inline">ONBOARDING = SIGNED IN · MFA · PLACED</span>
            ) : (
              <button type="button" onClick={() => setSeg("all")} className="text-[11px] font-semibold text-brand hover:underline">Clear filter</button>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${ROW_GRID} border-b border-[var(--hair)] p-[9px_18px] font-mono text-[9px] font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
                <span>User</span><span>Roles</span><span>Onboarding</span><span>Last active</span><span />
              </div>
              {rows.map((u) => {
                const s = steps(u);
                const okCount = [s.signedIn, s.mfa, s.placed].filter(Boolean).length;
                return (
                  <div key={u.id} className={`${ROW_GRID} border-b border-[var(--hair2)] p-[11px_18px] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-[30px] flex-none items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)", color: "var(--brand)" }}>
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-[var(--qink)]">{u.name}</span>
                          {u.status === "SUSPENDED" && <span className="rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.5px]" style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 14%, transparent)" }}>Susp</span>}
                        </span>
                        <span className="block truncate text-[11px] text-[var(--ink4)]">{u.email}</span>
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {u.roles.slice(0, 3).map((r) => (
                        <span key={r} className="rounded-[5px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[9px] tracking-[.3px] text-[var(--ink3)]">{r}</span>
                      ))}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Dot on={s.signedIn} label="Signed in" />
                      <Dot on={s.mfa} label="MFA enabled" />
                      <Dot on={s.placed} label="Placed on a team/project" />
                      <span className="ml-1 font-mono text-[9px] text-[var(--ink5)]">{okCount}/3</span>
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink4)]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : <span className="font-semibold text-[var(--warn)]">Never</span>}
                    </span>
                    <span className="flex justify-end">
                      <UserRowActions user={u} currentUserId={currentUserId} departments={departments} users={users} canManage={canManage} />
                    </span>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="p-8 text-center text-[12px] text-[var(--ink5)]">No users in this segment.</div>}
            </div>
          </div>
        </div>

        {/* Rail — Q admin insights */}
        <aside className="flex flex-col gap-3.5">
          <div className={`overflow-hidden ${CARD}`} style={{ background: "radial-gradient(380px 180px at 50% -60%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 65%), var(--cardbg)" }}>
            <div className="border-b border-[var(--hair)] p-[13px_16px] font-heading text-[13px] font-bold text-[var(--qink)]">Insights</div>
            <div className="flex flex-col">
              {insights.map((i, idx) => (
                <div key={idx} className="flex gap-2.5 border-b border-[var(--hair2)] p-[11px_16px] last:border-0">
                  <span className="mt-[5px] size-[7px] flex-none rounded-full" style={{ background: `var(${DOT[i.color]})` }} />
                  <span className="text-[12px] leading-[1.5] text-[var(--ink2)]">{i.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-dashed border-[var(--hair)] p-[14px_16px] text-[11.5px] leading-[1.55] text-[var(--ink4)]">
            A user is ready once they&apos;ve signed in, enabled MFA, and joined a team or project. Use the tiles above to
            find who&apos;s stuck, and &ldquo;New user&rdquo; to invite someone placed on day one.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return <span className="size-2 rounded-[2px]" style={{ background: on ? "var(--ok)" : "var(--w14)" }} title={`${label}: ${on ? "done" : "pending"}`} />;
}
