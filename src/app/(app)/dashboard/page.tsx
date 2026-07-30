import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isUserGroup } from "@/lib/personas";
import { getDevDashboard } from "@/server/dashboard-dev";
import { getExecutiveDashboard } from "@/server/dashboard-exec";
import { getImplDashboard } from "@/server/dashboard-impl";
import { getPmDashboard } from "@/server/dashboard-pm";
import { getQaDashboard } from "@/server/dashboard-qa";
import { getPortfolioSections } from "@/server/pipeline";
import { Forbidden } from "@/components/forbidden";
import { LiveClock } from "@/components/command/live-clock";
import { PersonaSwitcher } from "@/components/dashboard/persona-switcher";
import { DeveloperPreset } from "@/components/dashboard/presets/developer";
import { ExecutivePreset } from "@/components/dashboard/presets/executive";
import { ImplementorPreset } from "@/components/dashboard/presets/implementor";
import { PmPreset } from "@/components/dashboard/presets/pm";
import { QaPreset } from "@/components/dashboard/presets/qa";

// ── The dashboard shell (docs/17 §0): ONE route, one shell, per-persona composition.
// The session's resolved personas pick the preset; a ?persona= override (validated
// against the user's own groups) powers the switcher. Since M1c all five personas have
// dedicated presets — the interim v2 layout is retired (§8 complete).

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const { persona: requested, scope: requestedScope } = await searchParams;
  const personas = session.user.personas;
  const persona =
    isUserGroup(requested) && personas.includes(requested) ? requested : session.user.activePersona;
  const scope: "mine" | "all" = requestedScope === "all" ? "all" : "mine";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  const firstName = (session.user.name ?? "there").split(/\s+/)[0];

  return (
    <div>
      {/* Header strip: identity + persona switcher + Reports tab (§6 — link, not a copy) */}
      <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-3.5 px-6 pt-[18px] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <span className="font-mono rv:font-sans text-[10.5px] rv:text-overline font-semibold tracking-[2.4px] text-[var(--ink4)]">
          {persona.toUpperCase()} VIEW · {session.user.tenantName?.toUpperCase()}
        </span>
        <PersonaSwitcher personas={personas} active={persona} />
        <Link href="/reports" className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] text-[var(--ink4)] transition-colors hover:text-[var(--qink)]">
          <FileBarChart className="size-3" /> Reports
        </Link>
        <span className="-translate-y-[1px] flex-1 border-b border-[var(--hair2)]" />
        <span className="font-mono text-[10.5px] tracking-[1px] text-[var(--ink4)]">{today}</span>
        <LiveClock />
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[1.5px] text-[var(--ok)]">
          <span className="size-1.5 rounded-full bg-[var(--ok)] [animation:pulseGlow_2.6s_infinite]" /> LIVE
        </span>
      </div>

      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[14px_24px_90px]">
        {persona === "executive" ? (
          <ExecutivePreset d={await getExecutiveDashboard(ctx)} firstName={firstName} />
        ) : persona === "developer" ? (
          <DeveloperPreset d={await getDevDashboard(ctx)} sections={await getPortfolioSections(ctx)} userId={ctx.userId} />
        ) : persona === "pm" ? (
          <PmPreset d={await getPmDashboard(ctx)} sections={await getPortfolioSections(ctx)} userId={ctx.userId} scope={scope} />
        ) : persona === "qa" ? (
          <QaPreset d={await getQaDashboard(ctx)} sections={await getPortfolioSections(ctx)} userId={ctx.userId} scope={scope} />
        ) : (
          <ImplementorPreset d={await getImplDashboard(ctx)} sections={await getPortfolioSections(ctx)} userId={ctx.userId} scope={scope} />
        )}
      </main>
    </div>
  );
}
