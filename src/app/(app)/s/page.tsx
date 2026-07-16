import { redirect } from "next/navigation";
import { getTenantContext } from "@/server/tenant-db";
import { getHierarchyTree } from "@/server/hierarchy";

// /s — workspace root. Jump to the first space (ClickUp behavior); empty-state otherwise.
export default async function SpacesIndexPage() {
  const ctx = await getTenantContext();
  const tree = await getHierarchyTree(ctx);
  if (tree.length > 0) redirect(`/s/${tree[0].id}`);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-16 text-center">
      <h1 className="font-heading text-lg text-[var(--qink)]">No spaces yet</h1>
      <p className="max-w-sm text-[13px] text-[var(--ink4)]">
        Create your first space from the sidebar to start organizing work into folders, lists and
        tasks.
      </p>
    </div>
  );
}
