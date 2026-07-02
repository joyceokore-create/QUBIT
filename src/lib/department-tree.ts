export interface DepartmentTreeNode {
  id: string;
  name: string;
  parentId: string | null;
}

export interface IndentedOption {
  id: string;
  label: string;
}

// Builds an alphabetically-sorted, depth-indented option list for a "parent department"
// picker. When excludeId is given, that department and its entire descendant subtree are
// pruned first — a UI-level mirror of the server's cycle-prevention check in
// src/server/departments.ts, not a replacement for it.
export function buildIndentedDepartmentOptions(
  departments: DepartmentTreeNode[],
  excludeId?: string,
): IndentedOption[] {
  const excluded = new Set<string>();
  if (excludeId) {
    excluded.add(excludeId);
    let added = true;
    while (added) {
      added = false;
      for (const d of departments) {
        if (d.parentId && excluded.has(d.parentId) && !excluded.has(d.id)) {
          excluded.add(d.id);
          added = true;
        }
      }
    }
  }

  const visible = departments.filter((d) => !excluded.has(d.id));
  const childrenByParent = new Map<string | null, DepartmentTreeNode[]>();
  for (const d of visible) {
    const key = d.parentId;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(d);
    childrenByParent.set(key, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name));
  }

  const options: IndentedOption[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const node of childrenByParent.get(parentId) ?? []) {
      options.push({ id: node.id, label: `${"— ".repeat(depth)}${node.name}` });
      walk(node.id, depth + 1);
    }
  }
  walk(null, 0);

  return options;
}
