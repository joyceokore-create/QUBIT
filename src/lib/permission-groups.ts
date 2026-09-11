// Module grouping for the permission catalogue — powers the checkbox picker on
// /admin/roles (tuma-style: permissions presented per feature module). Pure and
// client-safe. Groups come straight from each permission's `module` tag in
// src/lib/catalogue.ts, so a new permission always lands in a real module; anything
// whose module is unknown falls into "Other" so it can never silently disappear.

import { APP_MODULES, CATALOGUE_PERMISSIONS } from "@/lib/catalogue";

export interface PermissionGroup {
  label: string;
  permissions: string[];
}

export function groupPermissions(catalogue: readonly string[]): PermissionGroup[] {
  const moduleOf = new Map(CATALOGUE_PERMISSIONS.map((p) => [p.code, p.module]));
  const nameOf = new Map(APP_MODULES.map((m) => [m.code, m.name]));

  // Preserve APP_MODULES order; unknown-module permissions collect under "Other".
  const buckets = new Map<string, string[]>();
  const other: string[] = [];
  for (const perm of catalogue) {
    const mod = moduleOf.get(perm);
    if (mod && nameOf.has(mod)) {
      const list = buckets.get(mod) ?? buckets.set(mod, []).get(mod)!;
      list.push(perm);
    } else {
      other.push(perm);
    }
  }

  const groups: PermissionGroup[] = APP_MODULES.filter((m) => buckets.has(m.code)).map((m) => ({
    label: m.name,
    permissions: buckets.get(m.code)!,
  }));
  if (other.length) groups.push({ label: "Other", permissions: other });
  return groups;
}
