import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getTenantContext, forTenant } from "@/server/tenant-db";
import { getListStatuses } from "@/server/statuses";
import { listUsers } from "@/server/users";
import { listViews } from "@/server/views";
import { queryTasks } from "@/server/views/query";
import { ListViews, type ViewTask } from "@/components/clickup/list-views";

// /s/{spaceId}/l/{listId} — list page: breadcrumbs + the views workspace.
export default async function ListPage({
  params,
}: {
  params: Promise<{ spaceId: string; listId: string }>;
}) {
  const { spaceId, listId } = await params;
  const ctx = await getTenantContext();

  const list = await forTenant(ctx, (tx) =>
    tx.list.findUnique({
      where: { id: listId },
      include: { space: { select: { name: true, icon: true } }, folder: { select: { name: true } } },
    }),
  );
  if (!list || list.spaceId !== spaceId) notFound();

  const [statuses, users, views, initial] = await Promise.all([
    getListStatuses(ctx, listId),
    listUsers(ctx),
    listViews(ctx, "LIST", listId),
    queryTasks(ctx, listId, {}),
  ]);

  const initialTasks: ViewTask[] = initial.tasks.map((t) => ({
    id: t.id,
    seq: t.seq,
    name: t.name,
    statusId: t.statusId,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    isMilestone: t.isMilestone,
    status: t.status,
    assignees: t.assignees.map((a) => ({ userId: a.userId, name: a.user?.name ?? "" })),
    tags: t.tags.map((tg) => ({ name: tg.tag?.name ?? "", colorToken: tg.tag?.colorToken ?? "neutral" })),
  }));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink4)]">
        <Link href={`/s/${spaceId}`} className="flex items-center gap-1.5 hover:text-[var(--qink)]">
          <span>{list.space.icon ?? "🗂️"}</span>
          {list.space.name}
        </Link>
        {list.folder && (
          <>
            <ChevronRight className="size-3" />
            <span>{list.folder.name}</span>
          </>
        )}
        <ChevronRight className="size-3" />
        <span className="font-semibold text-[var(--qink)]">{list.name}</span>
      </div>

      <h1 className="text-[21px] font-bold tracking-[-.4px] text-[var(--qink)]">{list.name}</h1>

      <ListViews
        listId={listId}
        initialTasks={initialTasks}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, colorToken: s.colorToken }))}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        currentUserId={ctx.userId}
        savedViews={views.map((v) => ({ id: v.id, name: v.name, type: v.type, config: v.config as Record<string, unknown>, isPinned: v.isPinned }))}
      />
    </div>
  );
}
