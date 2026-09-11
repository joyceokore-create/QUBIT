import type { CockpitData, CockpitProject } from "@/server/dashboard-cockpit";
import { ProjectStripCard } from "./primitives";
import { CockpitPageHead } from "./page-head";
import { AskQBrief } from "./ask-q-brief";

const CARD = "rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]";
const cardStyle = { background: "var(--cardbg)" } as const;

// The member "my work" cockpit — the projects they lead or are a member of, with the items
// that need them. Deliberately slim (docs/17 §4: a member's world is their work, not the estate).
export function UserCockpit({ data, viewerId }: { data: CockpitData; viewerId: string }) {
  // A member's projects: those they lead (pmId) — membership rows aren't in the cockpit
  // payload, so lead is the available signal; empty falls back to a gentle empty state.
  const mine = data.projects.filter((p) => p.pmId === viewerId && !["Completed", "Cancelled"].includes(p.status));
  const attention = mine.filter((p) => p.calculated !== "G");

  return (
    <div className="flex flex-col gap-5">
      <CockpitPageHead
        title="My work"
        subtitle={`${mine.length} project${mine.length === 1 ? "" : "s"} you're on. ${attention.length} need attention.`}
      />

      {mine.length > 0 && <AskQBrief level="user" data={data} viewerId={viewerId} />}

      {mine.length === 0 ? (
        <div className={`${CARD} text-center text-[var(--ink3)]`} style={cardStyle}>
          You&apos;re not assigned to any active projects yet. When you are, they&apos;ll appear here.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {mine.map((p) => <div key={p.id} className="cockpit-card"><ProjectStripCard p={p} /></div>)}
        </div>
      )}
    </div>
  );
}

export type { CockpitData, CockpitProject };
