import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/server/tenant-db";
import { getHierarchyTree } from "@/server/hierarchy";

// /s/{spaceId} — open the space's first list, or show an empty state.
export default async function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const ctx = await getTenantContext();
  const tree = await getHierarchyTree(ctx);
  const space = tree.find((s) => s.id === spaceId);
  if (!space) notFound();

  const firstList = space.lists[0] ?? space.folders.flatMap((f) => f.lists)[0];
  if (firstList) redirect(`/s/${spaceId}/l/${firstList.id}`);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-16 text-center">
      <h1 className="font-heading text-lg rv:text-heading-md text-[var(--qink)]">{space.name}</h1>
      <p className="max-w-sm text-[13px] text-[var(--ink4)]">
        This space has no lists yet. Add one from the sidebar (hover the space → ＋).
      </p>
    </div>
  );
}
