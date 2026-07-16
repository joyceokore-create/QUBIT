import { getTenantContext } from "@/server/tenant-db";
import { getHierarchyTree } from "@/server/hierarchy";
import { SpacesSidebar } from "@/components/clickup/spaces-sidebar";
import { TaskPanelProvider } from "@/components/clickup/task-panel-context";
import { TaskPanel } from "@/components/clickup/task-panel";

/**
 * Spaces workspace shell (04-module-specs §1). Sits inside the (app) shell (topbar
 * already rendered): a persistent Space→Folder→List sidebar + the routed content,
 * with the task panel mounted once for the whole subtree.
 */
export default async function SpacesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  const tree = await getHierarchyTree(ctx);

  return (
    <TaskPanelProvider>
      <div className="flex flex-1 overflow-hidden">
        <SpacesSidebar tree={tree} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <TaskPanel />
    </TaskPanelProvider>
  );
}
