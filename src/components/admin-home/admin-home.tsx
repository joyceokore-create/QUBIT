"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Bars, Meter, Spark } from "@/components/ui/kpi-charts";
import { Chip } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Banner, Columns, Foot, ListRow, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_INPUT, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { PageHeader } from "@/components/list/page-header";
import { useListUrl } from "@/components/list/use-list-url";
import { formatDate, formatDayMonth } from "@/lib/dates";
import { ONBOARDING_ROLE_TIERS } from "@/lib/roles";
import {
  AR_TAB_LABEL,
  AR_TAB_STATUS,
  AR_TABS,
  agoLabel,
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
} from "@/lib/admin-home";
import { COMPACT, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX11 + UX fidelity F1 — Super Admin › Admin home, built to design spec v2 (docs/08). Brief →
 * four KPI cards with mini charts → "Access Requests" panel (Waiting · Approved · Declined) →
 * rail (accounts needing attention, integrations, recent admin activity). Review opens the
 * access-request drawer: approve (creates the account through the same engine as Users ›
 * Invite User, then marks the request approved) or decline.
 */

const EMPTY: Record<ArTab, string> = {
  waiting: "No access requests waiting",
  reviewed: "No approved requests yet",
  dismissed: "No declined requests",
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
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now).replace(",", "");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={dateLine} title="Admin Home" description="Keep access and accounts healthy. All delivery data stays one click away." />

      {brief}

      <KpiRow count={k.waiting ? 4 : 3} label="Your numbers">
        {k.waiting && <KpiCard label="Access Requests Waiting" value={k.waiting.count} context={oldestContext(k.waiting.oldestAt, now, tz)} chart={<Bars values={k.waiting.perDay} />} />}
        <KpiCard label="Active Users, Last 30 Days" value={k.activeUsers.active30} unit={`of ${k.activeUsers.active}`} context={`Signed in since ${formatDayMonth(k.activeUsers.since, tz)}`} chart={<Meter value={k.activeUsers.active30} max={k.activeUsers.active} tone="ok" />} />
        {k.noMfa === null ? (
          <KpiCard label="Users Without MFA" value="—" context="Microsoft sign-in (SSO) handles MFA" />
        ) : (
          <KpiCard
            label="Users Without MFA"
            value={k.noMfa}
            context={k.noMfa ? "Asked to set it up at next sign-in" : "Every active user has MFA"}
            contextTone={k.noMfa ? "bad" : "good"}
            chart={<Meter value={k.noMfa} max={Math.max(k.activeUsers.active, 1)} tone="warn" />}
          />
        )}
        <KpiCard
          label="Role Changes This Week"
          value={k.roleChanges.granted + k.roleChanges.removed}
          context={k.roleChanges.granted + k.roleChanges.removed ? `${k.roleChanges.granted} granted · ${k.roleChanges.removed} removed` : `None since Monday ${formatDayMonth(k.roleChanges.since, tz)}`}
          chart={<Spark values={k.roleChanges.perDay} />}
        />
      </KpiRow>

      <Columns
        main={
          req ? (
            <Panel title="Access Requests" labelledBy="admin-home-requests" action={<TextLink href="/admin/access-requests">All Requests</TextLink>}>
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
              {req.rows.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
                  <p className="text-[14px] font-semibold text-[var(--ds-ink)]">{EMPTY[req.tab]}</p>
                  <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">Requests from the public “Get started” form appear here, oldest first.</p>
                </div>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {req.rows.map((r) => {
                    const days = daysOld(r.createdAt, now, tz);
                    const chip = requestChip(r.status, days);
                    return (
                      <ListRow
                        key={r.id}
                        title={r.fullName}
                        sub={[r.jobTitle, r.company].filter(Boolean).join(" · ")}
                        chip={<Chip tone={chip.tone}>{chip.label}</Chip>}
                        meta={<span title={`Requested ${formatDate(r.createdAt, tz)}`}>{agoLabel(days)}</span>}
                        action={
                          <button type="button" onClick={() => setOpen(r)} className={COMPACT}>
                            {r.status === "NEW" ? "Review" : "View"}
                          </button>
                        }
                      />
                    );
                  })}
                </ul>
              )}
              <Foot action={req.info.total > req.rows.length ? <TextLink href={`/admin/access-requests${req.tab === "waiting" ? "" : `?tab=${req.tab}`}`}>Show All</TextLink> : undefined}>
                {req.info.total ? `Showing ${req.rows.length} of ${req.info.total}` : null}
              </Foot>
            </Panel>
          ) : (
            <Panel>
              <p className="text-[13px] text-[var(--ds-ink3)]">Reviewing access requests needs identity and access management rights.</p>
            </Panel>
          )
        }
        rail={
          <>
            <Attention data={data} />
            {data.integrations && (
              <Panel title="Integrations" action={<TextLink href="/configs">Configs</TextLink>}>
                {data.integrations.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ds-ink3)]">No integrations connected.</p>
                ) : (
                  <PanelList>
                    {data.integrations.map((it) => {
                      const h = integrationHealth(it);
                      return <PanelRow key={it.provider} title={`${providerLabel(it.provider)} sync`} sub={integrationDetail(it, now, tz)} chip={<Chip tone={h.tone}>{h.label}</Chip>} />;
                    })}
                  </PanelList>
                )}
              </Panel>
            )}
            {data.activity && (
              <Panel title="Recent Admin Activity" action={<TextLink href="/admin/audit">Audit Log</TextLink>}>
                {data.activity.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ds-ink3)]">No admin changes recorded yet.</p>
                ) : (
                  <PanelList>
                    {data.activity.map((a) => (
                      <PanelRow key={a.id} title={a.line} sub={`by ${a.actorName ?? "System"} · ${whenLabel(a.createdAt, now, tz)}`} />
                    ))}
                  </PanelList>
                )}
              </Panel>
            )}
          </>
        }
      />

      <AccessRequestDrawer request={open} grant={data.grant} tz={tz} now={now} onClose={() => setOpen(null)} />
    </main>
  );
}

function Attention({ data }: { data: AdminHomeData }) {
  const a = data.attention;
  const rows: { title: string; n: number; href: string; sub: string; action: boolean }[] = [
    ...(a.noMfa === null ? [] : [{ title: `${a.noMfa} ${a.noMfa === 1 ? "user" : "users"} without MFA`, n: a.noMfa, href: "/admin/users?tab=nomfa", sub: "Asked to set it up at their next sign-in", action: true }]),
    { title: `${a.expiredInvites} ${a.expiredInvites === 1 ? "invite" : "invites"} expired`, n: a.expiredInvites, href: "/admin/users?onboarding=not-signed-in", sub: "Resend or remove", action: false },
    { title: `${a.suspendedInTeams} suspended ${a.suspendedInTeams === 1 ? "account" : "accounts"} still in teams`, n: a.suspendedInTeams, href: "/admin/users?status=SUSPENDED", sub: "Remove from teams", action: false },
  ];
  return (
    <Panel title="Accounts Needing Attention">
      <PanelList>
        {rows.map((r) => (
          <PanelRow
            key={r.href}
            title={
              r.n > 0 ? (
                <Link href={r.href} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                  {r.title}
                </Link>
              ) : (
                r.title
              )
            }
            sub={r.sub}
            chip={r.n > 0 ? r.action ? <Chip tone="warn">Action</Chip> : <Chip>Tidy up</Chip> : <Chip tone="ok">All clear</Chip>}
          />
        ))}
      </PanelList>
      {data.sso && <p className="text-[12px] text-[var(--ds-ink3)]">MFA is handled by Microsoft sign-in, so it isn&apos;t counted here.</p>}
    </Panel>
  );
}

// ── Access request drawer (design: "Review an access request") ───────────────────────

type Done = { emailed: boolean; acceptUrl?: string; sso?: boolean };

export function AccessRequestDrawer({ request, grant, tz, now, onClose }: { request: AdminRequestRow | null; grant: GrantOptions | null; tz: string; now: Date; onClose: () => void }) {
  return (
    <Drawer open={!!request} onClose={onClose}>
      {/* key: a fresh form (and state) per request */}
      {request && <ReviewBody key={request.id} r={request} grant={grant} tz={tz} now={now} onClose={onClose} />}
    </Drawer>
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
  const [mode, setMode] = useState<"review" | "decline" | "done">("review");
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

  async function approve(e: FormEvent) {
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
    toast.success(`Account created for ${r.fullName}. Request approved.`);
    router.refresh();
  }

  async function decline(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await send(`/api/admin/access-requests/${r.id}`, "PATCH", { status: "DISMISSED", reason: reason.trim() || undefined });
    setBusy(false);
    if (!ok) {
      setError(errorOf(data, "Couldn't decline the request. Try again."));
      return;
    }
    toast.success("Request declined.");
    onClose();
    router.refresh();
  }

  async function copyLink() {
    if (!done?.acceptUrl) return;
    await navigator.clipboard.writeText(done.acceptUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const backToReview = () => {
    setMode("review");
    setError(null);
  };

  const header = (
    <DrawerHeader
      step={mode === "decline" ? "Decline Access Request" : undefined}
      title={`Access Request · ${r.fullName}`}
      subtitle={`Submitted ${agoLabel(days).toLowerCase()} through Request Access`}
      onBack={mode === "decline" ? backToReview : undefined}
      backLabel="Back to Request"
    />
  );

  if (mode === "done" && done) {
    return (
      <DrawerFrame
        header={header}
        footer={
          <DrawerFooter>
            <Link href="/admin/users" className={SECONDARY}>
              Open Users
            </Link>
            <button type="button" onClick={onClose} className={PRIMARY}>
              Done
            </button>
          </DrawerFooter>
        }
      >
        <Banner>
          {done.sso
            ? `${r.email} can sign in now with Microsoft, as long as they're in your organisation's directory.`
            : done.emailed
              ? `An invite is on its way to ${r.email}. The link expires in 72 hours.`
              : `Email isn't configured here, so send ${r.email} this one-time link yourself. It expires in 72 hours and works once.`}
        </Banner>
        {done.acceptUrl && (
          <div className="flex items-center gap-2 rounded-[var(--ds-radius-kv)] bg-[var(--ds-surface2)] p-3">
            <code className="flex-1 truncate font-mono text-[12px] text-[var(--ds-ink)]">{done.acceptUrl}</code>
            <button type="button" onClick={copyLink} className={COMPACT}>
              {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        <DrawerText hint>The request is approved. Their role and placement can be changed any time in Users.</DrawerText>
      </DrawerFrame>
    );
  }

  if (mode === "decline") {
    return (
      <DrawerFrame
        header={header}
        onSubmit={decline}
        footer={
          <DrawerFooter>
            <button type="button" onClick={backToReview} className={SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? "Declining…" : "Decline Request"}
            </button>
          </DrawerFooter>
        }
      >
        <DrawerText>No account is created. The request moves to Declined.</DrawerText>
        <Field label="Reason (optional)" hint="Kept in the audit log. Up to 300 characters; no personal details.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="For example: not a Riverbank employee" className={FIELD_TEXTAREA} />
        </Field>
        {error && <DrawerError>{error}</DrawerError>}
      </DrawerFrame>
    );
  }

  const details = (
    <DrawerSection title="Request">
      <Kv
        rows={[
          ["Name", r.fullName],
          ["Email", r.email],
          ["Company", r.company],
          ["Job title", r.jobTitle ?? "Not given"],
          ["Requested", formatDate(r.createdAt, tz)],
          ...(!waiting
            ? ([
                ["Status", <Chip key="s" tone={requestChip(r.status, days).tone}>{requestChip(r.status, days).label}</Chip>],
                ["Decided", r.reviewedAt ? `${formatDate(r.reviewedAt, tz)}${r.reviewedBy ? ` by ${r.reviewedBy}` : ""}` : "Not recorded"],
              ] as [string, ReactNode][])
            : []),
        ]}
      />
    </DrawerSection>
  );

  if (!waiting || !grant) {
    return (
      <DrawerFrame
        header={header}
        footer={
          <DrawerFooter>
            {waiting ? (
              <button type="button" onClick={() => setMode("decline")} className={PRIMARY}>
                Decline
              </button>
            ) : (
              <button type="button" onClick={onClose} className={SECONDARY}>
                Close
              </button>
            )}
          </DrawerFooter>
        }
      >
        {details}
        {waiting && !grant && <DrawerText hint>Creating accounts needs the right to invite users. You can still decline the request.</DrawerText>}
        {error && <DrawerError>{error}</DrawerError>}
      </DrawerFrame>
    );
  }

  return (
    <DrawerFrame
      header={header}
      onSubmit={approve}
      footer={
        <DrawerFooter>
          <button type="button" onClick={() => { setMode("decline"); setError(null); }} className={SECONDARY}>
            Decline
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Creating…" : "Approve and Send Invite"}
          </button>
        </DrawerFooter>
      }
    >
      {details}
      <DrawerSection title="Grant Access">
        <div className="flex flex-col gap-3">
          <Field label="Role" hint={tiers.find((t) => t.key === role)?.desc}>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD_INPUT}>
              {tiers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team (optional)">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={FIELD_INPUT}>
              <option value="">No team</option>
              {grant.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={FIELD_INPUT}>
              <option value="">No department yet</option>
              {grant.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </DrawerSection>
      <Banner>{needsHeadApproval(role) ? "Project Manager and Head roles need a Head to approve first. That approval step isn't in QUBIT yet, so check with the Head before you approve." : "Member access can be approved now. Project Manager and Head roles need a Head to approve first."}</Banner>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}
