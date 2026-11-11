import { PageHeader } from "@/components/list/page-header";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listManagedTasks, listTasksInTestPhase, type MyTaskRow } from "@/server/project-tasks";
import { Forbidden } from "@/components/forbidden";
import { PersonalBoard } from "@/components/board/personal-board";
import { ApprovalQueue } from "../my-tasks/approval-queue";

// /board — every user's personal board (docs/18 §4): To do · Doing · Done lanes over
// the task taxonomy, grouped by project. Replaces /my-tasks as the daily surface (that
// route redirects here). The PM approval queue and the role reference lists (DM1.12)
// moved here with it.

function ReferenceList({ title, rows }: { title: string; rows: MyTaskRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[16px] font-bold text-[var(--ds-ink)]">{title}</h2>
      <div className="flex flex-col rounded-[var(--ds-radius-card)] border border-[var(--ds-bd)] shadow-[var(--ds-shadow)]" style={{ background: "var(--ds-card)" }}>
        {rows.slice(0, 8).map((t) => (
          <Link
            key={t.id}
            href={`/projects/${t.projectId}?tab=Board&task=${t.id}`}
            className="flex items-baseline gap-2.5 border-b border-dotted border-[var(--ds-line)] px-[18px] py-2.5 transition-colors last:border-0 hover:bg-[var(--ds-surface2)]"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ds-ink)]">{t.title}</span>
            <span className="text-[11.5px] text-[var(--ds-ink3)]">{t.projectCode} · {t.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const roles = session.user.roles;
  const isManager = roles.includes("ProjectManager") || roles.includes("HeadOfProjects");
  const isQa = roles.includes("HeadOfQA");
  const [managed, inTest] = await Promise.all([
    isManager ? listManagedTasks(ctx, ctx.userId) : Promise.resolve([] as MyTaskRow[]),
    isQa ? listTasksInTestPhase(ctx) : Promise.resolve([] as MyTaskRow[]),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_22px_90px]">
      <PageHeader title="My Board" description="Your tasks across all projects." />
      <PersonalBoard viewerName={session.user.name ?? "you"} />
      {/* The PM's task-approval queue stays reachable here, under the board (design: the board first). */}
      <ApprovalQueue />
      <ReferenceList title="Across My Projects (Assigned to Others)" rows={managed} />
      <ReferenceList title="In Test (QA View)" rows={inTest} />
    </main>
  );
}
