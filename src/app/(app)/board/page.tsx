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
      <h2 className="font-heading text-[12.5px] font-bold text-[var(--qink)]">{title}</h2>
      <div className="flex flex-col rounded-[12px] border border-[var(--cardbd)]" style={{ background: "var(--cardbg)" }}>
        {rows.slice(0, 8).map((t) => (
          <Link
            key={t.id}
            href={`/projects/${t.projectId}?tab=Board&task=${t.id}`}
            className="flex items-baseline gap-2.5 border-b border-[var(--hair2)] p-[8px_14px] transition-colors last:border-0 hover:bg-[var(--wash)]"
          >
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{t.title}</span>
            <span className="font-mono text-[9px] uppercase tracking-[.6px] text-[var(--ink4)]">{t.projectCode} · {t.status}</span>
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
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      <div className="flex items-baseline gap-3">
        <h1 className="font-heading text-[19px] font-bold tracking-[-.4px] text-[var(--qink)]">My Board</h1>
        <span className="font-mono text-[9.5px] uppercase tracking-[1.4px] text-[var(--ink4)]">TO DO · DOING · DONE</span>
      </div>
      <ApprovalQueue />
      <PersonalBoard viewerName={session.user.name ?? "you"} />
      <ReferenceList title="Across my projects (assigned to others)" rows={managed} />
      <ReferenceList title="In test (QA view)" rows={inTest} />
    </main>
  );
}
