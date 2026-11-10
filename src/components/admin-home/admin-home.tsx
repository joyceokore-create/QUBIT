"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KpiCard } from "@/components/ui/kpi-card";
import { TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { formatDate, formatDayMonth } from "@/lib/dates";
import { ONBOARDING_ROLE_TIERS } from "@/lib/roles";
import {
  AR_TAB_LABEL,
  AR_TAB_STATUS,
  AR_TABS,
  ageLabel,
  daysOld,
  integrationDetail,
  integrationHealth,
  needsHeadApproval,
  oldestContext,
  providerLabel,
  requestChip,
  whenLabel,
  type AdminHomeData,
  type AdminRequestRow,
  type ArTab,
  type Tone,
} from "@/lib/admin-home";
import { CARD, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX11 — Super Admin › Admin home (UX plan D3/D4, UX11). Brief → four KPI cards → one list
 * (Access requests: Waiting · Reviewed · Dismissed, server-paged) → side panel (accounts
 * needing attention, integrations, recent admin activity). Review opens a drawer: grant
 * access (creates the account through the same engine as Users › Create a user, then marks
 * the request reviewed) or dismiss it.
 */

const TONE: Record<Tone, string> = { bad: "--bad-ink", warn: "--warn-ink", info: "--stage-exploring", ok: "--ok-ink", muted: "--ink3" };
const COMPACT = `inline-flex h-[var(--control-h-compact)] items-center justify-center whitespace-nowrap rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`;
const LINK = `text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`;
const FIELD = `w-full rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3 text-[13px] text-[var(--qink)] placeholder:text-[var(--ink3)] ${FOCUS}`;
const H3 = "mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]";

function Chip({ tone, label }: { tone: Tone; label: string }) {
  const tok = TONE[tone];
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold" style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {label}
    </span>
  );
}

const EMPTY: Record<ArTab, string> = {
  waiting: "No access requests waiting",
  reviewed: "No reviewed requests yet",
  dismissed: "No dismissed requests",
};

type GrantOptions = NonNullable<AdminHomeData["grant"]>;

export function AdminHome({ data, brief, nowIso }: { data: AdminHomeData; brief: ReactNode; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const tz = data.timeZone;
  const list = useListUrl("admin-home-requests", 10);
  // A snapshot, not an id: after a grant the refresh moves the row off the Waiting tab, and
  // the drawer must stay open to show the result (and the invite link, if any).
  const [open, setOpen] = useState<AdminRequestRow | null>(null);
  const k = data.kpis;
  const req = data.requests;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink3)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now).replace(",", "")}</div>
          <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">Admin home</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink3)]">Keep access and accounts healthy. All delivery data stays one click away.</p>
        </div>
        <Link href="/admin/users" className={`inline-flex h-[var(--control-h)] items-center rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3.5 text-[13px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}>
          Users
        </Link>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {k.waiting && <KpiCard label="Access requests waiting" value={k.waiting.count} context={oldestContext(k.waiting.oldestAt, now, tz)} />}
        <KpiCard label="Active users, last 30 days" value={k.activeUsers.active30} unit={`of ${k.activeUsers.active}`} context={`Signed in since ${formatDayMonth(k.activeUsers.since, tz)}`} />
        {k.noMfa === null ? (
          <KpiCard label="Users without MFA" value="—" context="Microsoft sign-in (SSO) handles MFA" />
        ) : (
          <KpiCard label="Users without MFA" value={k.noMfa} context={k.noMfa ? "Asked to set it up at next sign-in" : "Every active user has MFA"} />
        )}
        <KpiCard
          label="Role changes this week"
          value={k.roleChanges.granted + k.roleChanges.removed}
          context={k.roleChanges.granted + k.roleChanges.removed ? `${k.roleChanges.granted} granted · ${k.roleChanges.removed} removed` : `None since Monday ${formatDayMonth(k.roleChanges.since, tz)}`}
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {req ? (
          <section aria-label="Access requests" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
              <nav aria-label="Access request views">
                <ul className={TABS_ROW}>
                  {AR_TABS.map((t) => (
                    <li key={t}>
                      <button type="button" aria-current={t === req.tab ? "page" : undefined} onClick={() => list.set({ tab: t === "waiting" ? null : t })} className={cn(TAB, t === req.tab && TAB_ACTIVE_ON_CARD)}>
                        {AR_TAB_LABEL[t]}
                        <span className={TAB_COUNT}>{req.counts[AR_TAB_STATUS[t]]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <Link href="/admin/access-requests" className={`mb-2 ${LINK}`}>
                All requests →
              </Link>
            </div>
            {req.rows.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[var(--qink)]">{EMPTY[req.tab]}</p>
                <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">Requests from the public “Get started” form appear here, oldest first.</p>
              </div>
            ) : (
              <ul>
                {req.rows.map((r) => {
                  const days = daysOld(r.createdAt, now, tz);
                  const chip = requestChip(r.status, days);
                  const sub = [r.email, r.company, r.jobTitle].filter(Boolean).join(" · ");
                  return (
                    <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_80px_auto]">
                      <div className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]">{r.fullName}</span>
                        <span className="block truncate text-[12px] text-[var(--ink3)]">{sub}</span>
                        <span className="mt-1 flex items-center gap-2 sm:hidden">
                          <Chip tone={chip.tone} label={chip.label} />
                          <span className="text-[12px] text-[var(--ink2)]">{ageLabel(days)}</span>
                        </span>
                      </div>
                      <span className="max-sm:hidden">
                        <Chip tone={chip.tone} label={chip.label} />
                      </span>
                      <span className="truncate text-[12.5px] tabular-nums text-[var(--ink2)] max-sm:hidden" title={`Requested ${formatDate(r.createdAt, tz)}`}>
                        {ageLabel(days)}
                      </span>
                      <button type="button" onClick={() => setOpen(r)} className={COMPACT}>
                        {r.status === "NEW" ? "Review" : "View"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <TableFooter info={req.info} onPage={list.setPage} onSize={list.setSize} noun="access requests" />
          </section>
        ) : (
          <section className={cn(CARD, "p-6 text-[13px] text-[var(--ink3)]")} style={{ background: "var(--cardbg)" }}>
            Reviewing access requests needs identity and access management rights.
          </section>
        )}

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          <Attention data={data} />
          {data.integrations && (
            <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Integrations</h2>
                <Link href="/configs" className={LINK}>
                  Configs →
                </Link>
              </div>
              {data.integrations.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink3)]">No integrations connected.</p>
              ) : (
                <ul>
                  {data.integrations.map((it) => {
                    const h = integrationHealth(it);
                    return (
                      <li key={it.provider} className="border-t border-[var(--border)] py-2 first:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--qink)]">{providerLabel(it.provider)}</span>
                          <Chip tone={h.tone} label={h.label} />
                        </div>
                        <span className="block text-[12px] text-[var(--ink3)]">{integrationDetail(it, now, tz)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {data.activity && (
            <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Recent admin activity</h2>
                <Link href="/admin/audit" className={LINK}>
                  Audit log →
                </Link>
              </div>
              {data.activity.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink3)]">No admin changes recorded yet.</p>
              ) : (
                <ul>
                  {data.activity.map((a) => (
                    <li key={a.id} className="border-t border-[var(--border)] py-2 first:border-0">
                      <span className="block text-[13px] text-[var(--qink)]">{a.line}</span>
                      <span className="block text-[12px] text-[var(--ink3)]">
                        {a.actorName ?? "System"} · {whenLabel(a.createdAt, now, tz)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>

      <ReviewDrawer request={open} grant={data.grant} tz={tz} now={now} onClose={() => setOpen(null)} />
    </main>
  );
}

function Attention({ data }: { data: AdminHomeData }) {
  const a = data.attention;
  const rows: { label: string; n: number; href: string; sub: string }[] = [
    ...(a.noMfa === null ? [] : [{ label: "Users without MFA", n: a.noMfa, href: "/admin/users?tab=nomfa", sub: "Active, no authenticator set up" }]),
    { label: "Invites expired", n: a.expiredInvites, href: "/admin/users?onboarding=not-signed-in", sub: "Never signed in; the link ran out" },
    { label: "Suspended, still in teams", n: a.suspendedInTeams, href: "/admin/users?status=SUSPENDED", sub: "Remove them from their teams" },
  ];
  return (
    <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Accounts needing attention</h2>
        <Link href="/admin/users" className={LINK}>
          Users →
        </Link>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 first:border-0">
            <span className="min-w-0">
              {r.n > 0 ? (
                <Link href={r.href} className={`text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  {r.label}
                </Link>
              ) : (
                <span className="text-[13px] font-semibold text-[var(--qink)]">{r.label}</span>
              )}
              <span className="block text-[12px] text-[var(--ink3)]">{r.sub}</span>
            </span>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: `var(${r.n > 0 ? "--warn-ink" : "--ink3"})` }}>
              {r.n}
            </span>
          </li>
        ))}
      </ul>
      {data.sso && <p className="mt-1 text-[12px] text-[var(--ink3)]">MFA is handled by Microsoft sign-in, so it isn&apos;t counted here.</p>}
    </section>
  );
}

// ── Review drawer ──────────────────────────────────────────────────────────────────

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--ink3)]">{k}</dt>
          <dd className="min-w-0 break-words text-[var(--qink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

type Done = { emailed: boolean; acceptUrl?: string; sso?: boolean };

function ReviewDrawer({ request, grant, tz, now, onClose }: { request: AdminRequestRow | null; grant: GrantOptions | null; tz: string; now: Date; onClose: () => void }) {
  return (
    <Sheet open={!!request} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        {/* key: a fresh form (and state) per request */}
        {request && <ReviewBody key={request.id} r={request} grant={grant} tz={tz} now={now} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  return { ok: !!res?.ok, data };
}

function errorOf(data: Record<string, unknown> | null, fallback: string): string {
  const e = data?.error as { message?: unknown } | undefined;
  return typeof e?.message === "string" ? e.message : fallback;
}

function ReviewBody({ r, grant, tz, now, onClose }: { r: AdminRequestRow; grant: GrantOptions | null; tz: string; now: Date; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"review" | "dismiss" | "done">("review");
  const [role, setRole] = useState<string>("Member");
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const waiting = r.status === "NEW";
  const days = daysOld(r.createdAt, now, tz);
  const tiers = ONBOARDING_ROLE_TIERS.filter((t) => grant?.canGrantSuperAdmin || t.key !== "PlatformSuperAdmin");

  async function grantAccess(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await send(`/api/admin/access-requests/${r.id}/grant`, "POST", { role, departmentId: departmentId || null, teamId: teamId || null });
    setBusy(false);
    if (!ok) {
      setError(errorOf(data, "Couldn't create the account. The request is still waiting."));
      return;
    }
    setDone({ emailed: data?.emailed === true, acceptUrl: typeof data?.acceptUrl === "string" ? data.acceptUrl : undefined, sso: data?.sso === true });
    setMode("done");
    toast.success(`Account created for ${r.fullName}. Request marked reviewed.`);
    router.refresh();
  }

  async function dismiss(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await send(`/api/admin/access-requests/${r.id}`, "PATCH", { status: "DISMISSED", reason: reason.trim() || undefined });
    setBusy(false);
    if (!ok) {
      setError(errorOf(data, "Couldn't dismiss the request. Try again."));
      return;
    }
    toast.success("Request dismissed.");
    onClose();
    router.refresh();
  }

  async function copyLink() {
    if (!done?.acceptUrl) return;
    await navigator.clipboard.writeText(done.acceptUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const head = (
    <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
      {mode === "dismiss" && (
        <button type="button" onClick={() => { setMode("review"); setError(null); }} className={`mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
          <ArrowLeft className="size-3.5" aria-hidden /> Back to request
        </button>
      )}
      <div className="text-[11.5px] font-semibold text-[var(--ink3)]">{mode === "dismiss" ? "Dismiss access request" : "Access request"}</div>
      <SheetTitle className="mt-0.5 text-[17px] font-bold text-[var(--qink)]">{r.fullName}</SheetTitle>
      <SheetDescription className="mt-0.5 text-[12.5px] text-[var(--ink3)]">
        {r.company} · requested {formatDate(r.createdAt, tz)}
      </SheetDescription>
    </div>
  );

  const errorLine = error && (
    <p role="alert" className="text-[12.5px] font-semibold text-[var(--bad-ink)]">
      {error}
    </p>
  );

  if (mode === "done" && done) {
    return (
      <div className="flex h-full flex-col">
        {head}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="flex items-start gap-2 rounded-[var(--control-r)] bg-[color-mix(in_oklab,var(--ok-ink)_8%,transparent)] px-3 py-2.5 text-[13px] text-[var(--qink)]">
            <Check className="mt-0.5 size-4 flex-none text-[var(--ok-ink)]" aria-hidden />
            <span>
              {done.sso
                ? `${r.email} can sign in now with Microsoft, as long as they're in your organization's directory.`
                : done.emailed
                  ? `An invite is on its way to ${r.email}. The link expires in 72 hours.`
                  : `Email isn't configured here, so send ${r.email} this one-time link yourself. It expires in 72 hours and works once.`}
            </span>
          </p>
          {done.acceptUrl && (
            <div className="flex items-center gap-2 rounded-[var(--control-r)] border border-[var(--border)] p-3">
              <code className="flex-1 truncate font-mono text-[12px] text-[var(--qink)]">{done.acceptUrl}</code>
              <button type="button" onClick={copyLink} className={SECONDARY}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          <p className="text-[12.5px] text-[var(--ink3)]">The request is marked reviewed. Their role and placement can be changed any time in Users.</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <Link href="/admin/users" className={SECONDARY}>
            Open Users
          </Link>
          <button type="button" onClick={onClose} className={PRIMARY}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (mode === "dismiss") {
    return (
      <form onSubmit={dismiss} className="flex h-full flex-col">
        {head}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="text-[13px] text-[var(--ink2)]">No account is created. The request moves to Dismissed.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--qink)]">Reason (optional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="For example: not a Riverbank employee" className={cn(FIELD, "py-2")} />
            <span className="text-[12px] text-[var(--ink3)]">Kept in the audit log. Up to 300 characters; no personal details.</span>
          </label>
          {errorLine}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button type="button" onClick={() => { setMode("review"); setError(null); }} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Dismissing…" : "Dismiss request"}
          </button>
        </div>
      </form>
    );
  }

  const details = (
    <section>
      <h3 className={H3}>Request</h3>
      <Kv
        rows={[
          ["Name", r.fullName],
          ["Work email", r.email],
          ["Company", r.company],
          ["Job title", r.jobTitle ?? "—"],
          ["Requested", `${formatDate(r.createdAt, tz)} · ${ageLabel(days).toLowerCase()}${days > 0 ? " ago" : ""}`],
          ...(!waiting ? ([["Status", <Chip key="s" {...requestChip(r.status, days)} />], ["Reviewed", r.reviewedAt ? `${formatDate(r.reviewedAt, tz)}${r.reviewedBy ? ` by ${r.reviewedBy}` : ""}` : "—"]] as [string, ReactNode][]) : []),
        ]}
      />
    </section>
  );

  if (!waiting || !grant) {
    return (
      <div className="flex h-full flex-col">
        {head}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {details}
          {waiting && !grant && <p className="text-[12.5px] text-[var(--ink3)]">Creating accounts needs the right to invite users. You can still dismiss the request.</p>}
          {errorLine}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          {waiting ? (
            <button type="button" onClick={() => setMode("dismiss")} className={PRIMARY}>
              Dismiss
            </button>
          ) : (
            <button type="button" onClick={onClose} className={SECONDARY}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={grantAccess} className="flex h-full flex-col">
      {head}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        {details}
        <section className="flex flex-col gap-4">
          <div>
            <h3 className={H3}>Grant access</h3>
            <p className="text-[12.5px] text-[var(--ink3)]">Creates their account with this name and email, the same way as Users › Create a user.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--qink)]">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={cn(FIELD, "h-[var(--control-h)]")}>
              {tiers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-[var(--ink3)]">{tiers.find((t) => t.key === role)?.desc}</span>
          </label>
          {needsHeadApproval(role) && (
            <p className="flex items-start gap-2 rounded-[var(--control-r)] bg-[color-mix(in_oklab,var(--stage-exploring)_8%,transparent)] px-3 py-2.5 text-[12.5px] text-[var(--qink)]">
              <Info className="mt-0.5 size-4 flex-none text-[var(--stage-exploring)]" aria-hidden />
              <span>A Head&apos;s approval step for PM and Head roles isn&apos;t in QUBIT yet.</span>
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--qink)]">Department</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={cn(FIELD, "h-[var(--control-h)]")}>
              <option value="">No department yet</option>
              {grant.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--qink)]">Team (optional)</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={cn(FIELD, "h-[var(--control-h)]")}>
              <option value="">No team</option>
              {grant.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {errorLine}
        </section>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={() => { setMode("dismiss"); setError(null); }} className={SECONDARY}>
          Dismiss
        </button>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Creating…" : "Grant access"}
        </button>
      </div>
    </form>
  );
}
