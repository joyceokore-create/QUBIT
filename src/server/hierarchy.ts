import type { Prisma, LocationType } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant } from "@/server/tenant-db";
import { NotFoundError } from "@/server/errors";

/**
 * Hierarchy helpers (docs/clickup-transformation/03-data-model.md §Conventions):
 * location polymorphism (`resolveLocation`), inheritance resolution
 * (List → Folder → Space → defaults), and the sidebar tree (`getHierarchyTree`).
 * Everything runs inside `forTenant()` so RLS scopes it to the caller's tenant.
 */

export interface ResolvedLocation {
  type: LocationType;
  id: string;
  /** The owning space id (self for SPACE; null for EVERYTHING/USER which have no row). */
  spaceId: string | null;
}

/**
 * Validate that a `(locationType, locationId)` pair points at a real object in the
 * caller's tenant. Throws NotFoundError (→404) for missing or cross-tenant ids.
 * EVERYTHING/USER are virtual locations with no backing row.
 */
export async function resolveLocation(
  tx: Prisma.TransactionClient,
  type: LocationType,
  id: string | null,
): Promise<ResolvedLocation> {
  switch (type) {
    case "SPACE": {
      const space = await tx.space.findUnique({ where: { id: id ?? "" }, select: { id: true } });
      if (!space) throw new NotFoundError("Space not found.");
      return { type, id: space.id, spaceId: space.id };
    }
    case "FOLDER": {
      const folder = await tx.folder.findUnique({
        where: { id: id ?? "" },
        select: { id: true, spaceId: true },
      });
      if (!folder) throw new NotFoundError("Folder not found.");
      return { type, id: folder.id, spaceId: folder.spaceId };
    }
    case "LIST": {
      const list = await tx.list.findUnique({
        where: { id: id ?? "" },
        select: { id: true, spaceId: true },
      });
      if (!list) throw new NotFoundError("List not found.");
      return { type, id: list.id, spaceId: list.spaceId };
    }
    case "EVERYTHING":
    case "USER":
      return { type, id: id ?? type, spaceId: null };
    default:
      throw new NotFoundError("Unknown location type.");
  }
}

/**
 * Resolve the effective StatusGroup for a list by walking the inheritance chain
 * List → (Folder) → Space. Folders don't own status groups in the schema, so the
 * chain is List's own group, else the owning space's group. `cache` memoizes
 * space→group lookups within a single request (pass one Map per request).
 */
export async function resolveStatusGroupId(
  tx: Prisma.TransactionClient,
  listId: string,
  cache: Map<string, string | null> = new Map(),
): Promise<string | null> {
  const list = await tx.list.findUnique({
    where: { id: listId },
    select: { statusGroupId: true, spaceId: true },
  });
  if (!list) throw new NotFoundError("List not found.");
  if (list.statusGroupId) return list.statusGroupId;

  if (cache.has(list.spaceId)) return cache.get(list.spaceId) ?? null;
  const spaceGroup = await tx.statusGroup.findFirst({
    where: { spaceId: list.spaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const resolved = spaceGroup?.id ?? null;
  cache.set(list.spaceId, resolved);
  return resolved;
}

// ── Sidebar tree ───────────────────────────────────────────────────────────

export interface ListNode {
  id: string;
  name: string;
  orderIndex: number;
  taskCount: number;
}
export interface FolderNode {
  id: string;
  name: string;
  orderIndex: number;
  folders: FolderNode[];
  lists: ListNode[];
}
export interface SpaceNode {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isPrivate: boolean;
  orderIndex: number;
  folders: FolderNode[];
  lists: ListNode[]; // folderless
}

/**
 * Full sidebar tree in one call: spaces → folders (nested) → lists, with live task
 * counts. RLS guarantees only the caller's tenant is returned. Archived nodes omitted.
 */
export async function getHierarchyTree(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
): Promise<SpaceNode[]> {
  return forTenant(ctx, async (tx) => {
    const [spaces, folders, lists, taskCounts] = await Promise.all([
      tx.space.findMany({ where: { archived: false }, orderBy: { orderIndex: "asc" } }),
      tx.folder.findMany({ where: { archived: false }, orderBy: { orderIndex: "asc" } }),
      tx.list.findMany({ where: { archived: false }, orderBy: { orderIndex: "asc" } }),
      tx.task.groupBy({
        by: ["listId"],
        where: { archived: false, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const countByList = new Map(taskCounts.map((r) => [r.listId, r._count._all]));
    const toListNode = (l: (typeof lists)[number]): ListNode => ({
      id: l.id,
      name: l.name,
      orderIndex: l.orderIndex,
      taskCount: countByList.get(l.id) ?? 0,
    });

    // Index lists by folder and by space (folderless).
    const listsByFolder = new Map<string, ListNode[]>();
    const folderlessBySpace = new Map<string, ListNode[]>();
    for (const l of lists) {
      const node = toListNode(l);
      if (l.folderId) {
        (listsByFolder.get(l.folderId) ?? listsByFolder.set(l.folderId, []).get(l.folderId)!).push(
          node,
        );
      } else {
        (
          folderlessBySpace.get(l.spaceId) ??
          folderlessBySpace.set(l.spaceId, []).get(l.spaceId)!
        ).push(node);
      }
    }

    // Build folder nodes, then nest by parentId.
    const folderNodes = new Map<string, FolderNode>();
    for (const f of folders) {
      folderNodes.set(f.id, {
        id: f.id,
        name: f.name,
        orderIndex: f.orderIndex,
        folders: [],
        lists: listsByFolder.get(f.id) ?? [],
      });
    }
    const rootFoldersBySpace = new Map<string, FolderNode[]>();
    for (const f of folders) {
      const node = folderNodes.get(f.id)!;
      if (f.parentId && folderNodes.has(f.parentId)) {
        folderNodes.get(f.parentId)!.folders.push(node);
      } else {
        (
          rootFoldersBySpace.get(f.spaceId) ??
          rootFoldersBySpace.set(f.spaceId, []).get(f.spaceId)!
        ).push(node);
      }
    }

    return spaces.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
      isPrivate: s.isPrivate,
      orderIndex: s.orderIndex,
      folders: rootFoldersBySpace.get(s.id) ?? [],
      lists: folderlessBySpace.get(s.id) ?? [],
    }));
  });
}
