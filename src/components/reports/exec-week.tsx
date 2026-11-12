import Link from "next/link";
import { ExecTopCard } from "@/components/reports/exec-top-card";
import { StatusGrid } from "@/components/reports/status-grid";
import { COMPACT } from "@/lib/surface";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Meter } from "@/components/ui/kpi-charts";
import { Chip } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Columns, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import type { ExecWeekView, WeekMeta } from "@/server/reports-week";

// Milestone B + UX fidelity Tier 2 (design: "Executive report: this week"): the Head's signed
// line as a banner with Email Me Weekly / Print View, three equal On Track · At Risk · Off
// Track cards, status by project over eight weeks, and the blockers waiting on a decision.

const TILES = [
  { key: "green", label: "On Track", tone: "ok" },
  { key: "amber", label: "At Risk", tone: "warn" },
  { key: "red", label: "Off Track", tone: "bad" },
] as const;

export function ExecWeek({ data, week, subscribed, emailEnabled, pdfAvailable }: { data: ExecWeekView; week: WeekMeta; subscribed: boolean; emailEnabled: boolean; pdfAvailable: boolean }) {
  const computed = data.grid.reduce((n, g) => n + g.ragCounts.computed, 0);
  const total = data.tiles.total;
  return (
    <div className="flex flex-col gap-4">
      <ExecTopCard
        isoWeek={week.isoWeek}
        approved={
          data.approved
            ? { narrative: data.approved.narrative, approvedByName: data.approved.approvedByName, approvedAt: data.approved.approvedAt?.toISOString() ?? null }
            : null
        }
        inCount={{ in: total - computed, total }}
        subscribed={subscribed}
        emailEnabled={emailEnabled}
        pdfAvailable={pdfAvailable}
      />
      <KpiRow count={3} equal label={`This week across ${total} ${total === 1 ? "project" : "projects"}`}>
        {TILES.map((t) => (
          <KpiCard
            key={t.key}
            label={t.label}
            value={data.tiles[t.key]}
            unit={`of ${total}`}
            context={t.key === "red" && data.delta ? data.delta : undefined}
            chart={total ? <Meter value={data.tiles[t.key]} max={total} tone={t.tone} /> : undefined}
          />
        ))}
      </KpiRow>
      <Columns
        main={
          <StatusGrid title="Status Over 8 Weeks" weeks={data.weeks} groups={data.grid} hrefFor={(id) => `/projects/${id}?tab=This%20week`} />
        }
        rail={
          <Panel title="Blockers Needing a Decision" action={<TextLink href="/projects">Projects</TextLink>}>
            {data.decisions.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ds-ink3)]">Nothing is waiting on a decision this week.</p>
            ) : (
              <PanelList>
                {data.decisions.map((d) => (
                  <PanelRow
                    key={d.id}
                    title={d.description}
                    sub={`${d.projectName} · blocked ${d.ageDays} ${d.ageDays === 1 ? "day" : "days"}`}
                    chip={d.severity === "Critical" ? <Chip tone="bad">Critical</Chip> : d.escalated ? <Chip tone="warn">Escalated</Chip> : <Chip>{d.severity}</Chip>}
                  >
                    <Link href={`/projects/${d.projectId}?tab=Register`} className={`${COMPACT} self-start`}>
                      Open
                    </Link>
                  </PanelRow>
                ))}
              </PanelList>
            )}
          </Panel>
        }
      />
    </div>
  );
}
