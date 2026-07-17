import Link from "next/link";
import { statusMeta } from "@/lib/project-view";

// Shared App-v3 glass dashboard primitives (PROMPT §4). Used by every per-role body so the
// six dashboards read as one system. Tokens only — no raw colours.

const CARD =
  "overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

/** Titled glass section card. */
export function SectionCard({
  title,
  sub,
  right,
  delay = "0s",
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={CARD} style={{ background: "var(--cardbg)", animation: `rise .55s cubic-bezier(.22,1,.36,1) ${delay} both` }}>
      <div className="flex items-center gap-2.5 border-b border-[var(--hair)] p-[13px_16px]">
        <span className="font-heading text-[14px] font-bold tracking-[-.2px] text-[var(--qink)]">{title}</span>
        {sub && <span className="font-mono text-[9.5px] tracking-[1.2px] text-[var(--ink4)]">{sub}</span>}
        <span className="flex-1" />
        {right}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/** Narrow rail card (Signals / Milestones / Workload …). */
export function Rail({ title, sub, delay, children }: { title: string; sub: string; delay?: string; children: React.ReactNode }) {
  return <SectionCard title={title} sub={sub} delay={delay}>{children}</SectionCard>;
}

export function RailRow({ tok, text, meta, glow, href }: { tok: string; text: string; meta: string; glow?: boolean; href?: string }) {
  const inner = (
    <>
      <span
        className="w-[3px] flex-none self-stretch rounded-[2px]"
        style={{ background: `var(${tok})`, boxShadow: glow ? `0 0 8px color-mix(in oklab, var(${tok}) 40%, transparent)` : "none" }}
      />
      <span className="min-w-0">
        <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{text}</span>
        <span className="mt-[3px] block font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{meta}</span>
      </span>
    </>
  );
  const cls = "flex gap-[11px] border-b border-[var(--hair2)] p-[11px_16px] last:border-0";
  return href ? (
    <Link href={href} className={`${cls} transition-[transform,background] duration-200 hover:translate-x-1 hover:bg-[var(--wash)]`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[11px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}

/** Compact stat tile (admin/QA counters). */
export function StatTile({ label, value, tok = "--qink", foot }: { label: string; value: string | number; tok?: string; foot?: string }) {
  return (
    <div className="p-[16px_18px]">
      <div className="font-mono text-[9.5px] font-medium uppercase tracking-[1.8px] text-[var(--ink4)]">{label}</div>
      <div className="mt-1.5 font-heading text-[28px] font-bold leading-none tracking-[-.8px] tabular-nums" style={{ color: `var(${tok})` }}>{value}</div>
      {foot && <div className="mt-1 text-[10.5px] text-[var(--ink4)]">{foot}</div>}
    </div>
  );
}

/** Status pill using the shared project-view status meta (OnTrack/AtRisk/Overdue/…). */
export function StatusPill({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span
      className="rounded-[5px] p-[3px_7px] font-mono text-[9px] font-semibold tracking-[1px]"
      style={{ color: `var(${m.tok})`, border: `1px solid color-mix(in oklab, var(${m.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${m.tok}) 9%, transparent)` }}
    >
      {m.label}
    </span>
  );
}

/** A project row for at-risk / leadless / my-projects lists. */
export function ProjectRow({ id, code, name, status, right }: { id: string; code: string; name: string; status: string; right?: React.ReactNode }) {
  return (
    <Link
      href={`/projects/${id}`}
      className="flex items-center gap-3 border-b border-[var(--hair2)] p-[10px_16px] transition-[transform,background] duration-200 last:border-0 hover:translate-x-[3px] hover:bg-[var(--wash)]"
    >
      <span className="font-mono text-[10.5px] tracking-[.5px] text-[var(--ink4)]">{code}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--qink)]">{name}</span>
      {right}
      <StatusPill status={status} />
    </Link>
  );
}
