// Bulk people import (Admin → Users). This is the one piece of the retired org-setup
// wizard worth keeping: QUBIT serves a single tenant whose brand, markets and templates
// are settled, but onboarding a batch of people from an HR or YouTrack export stays a
// real recurring job. See DM1.72.
//
// One createUser per row, so every person gets their own M-O3 invite (a copyable link
// while email is off). A failing row becomes an error RESULT, never an aborted batch —
// one bad address must not cost the other forty.
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";
import { createUser } from "@/server/users";
import type { PeopleRow } from "@/lib/people-csv";
import type { UserGroup } from "@/lib/personas";

export class PeopleImportError extends Error {
  code: string;
  constructor(message: string, code = "PEOPLE_IMPORT_ERROR") {
    super(message);
    this.code = code;
  }
}

export interface ImportRowResult {
  email: string;
  status: "invited" | "error";
  message?: string;
  /** Present only while email is unconfigured — the admin copies it instead. */
  acceptUrl?: string;
}

/** Inviting people is `users:invite`; minting a Super Admin is separately guarded inside
 * createUser, so an importer cannot escalate through a CSV column. */
function assertMayInvite(ctx: TenantContext): void {
  if (!can(ctx, "users:invite")) {
    throw new PeopleImportError("You cannot invite people.", "FORBIDDEN");
  }
}

export async function importPeople(ctx: TenantContext, rows: PeopleRow[]): Promise<ImportRowResult[]> {
  assertMayInvite(ctx);
  const results: ImportRowResult[] = [];
  for (const row of rows) {
    try {
      const created = await createUser(ctx, {
        name: row.name,
        email: row.email,
        roles: [row.role],
        userGroups: row.group ? [row.group as UserGroup] : undefined,
      });
      results.push({
        email: row.email,
        status: "invited",
        ...(created.acceptUrl ? { acceptUrl: created.acceptUrl } : {}),
      });
    } catch (e) {
      results.push({
        email: row.email,
        status: "error",
        message: e instanceof Error ? e.message : "Could not invite.",
      });
    }
  }
  return results;
}
