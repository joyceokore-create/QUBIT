import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/lib/tenant";
import { ADMIN_DATASET_KEYS, MY_DATASET_KEYS } from "@/lib/report-catalogue";
import { allowedDatasetKeys, DATASET_PERMISSION, offeredDatasetKeys } from "@/server/custom-reports";

// UX11 (D13) — the admin datasets are offered to, and runnable by, exactly the viewers holding
// their page's gate: users ⇢ admin:access (the Users page), accessRequests ⇢ iam:manage.

const ctx = (roles: string[], permissions?: string[]): TenantContext => ({ tenantId: "t", userId: "u", roles, permissions });

describe("UX11 admin dataset gates", () => {
  it("map to the pages' permissions", () => {
    expect(DATASET_PERMISSION.users).toBe("admin:access");
    expect(DATASET_PERMISSION.accessRequests).toBe("iam:manage");
  });

  it("a Super Admin is offered and allowed both", () => {
    for (const fn of [allowedDatasetKeys, offeredDatasetKeys]) {
      expect(fn(ctx(["PlatformSuperAdmin"]))).toEqual(expect.arrayContaining([...ADMIN_DATASET_KEYS]));
      expect(fn(ctx([], ["*"]))).toEqual(expect.arrayContaining([...ADMIN_DATASET_KEYS]));
    }
  });

  it("nobody without the permission gets them", () => {
    for (const roles of [["Member"], ["ProjectManager"], ["Executive"], []]) {
      for (const fn of [allowedDatasetKeys, offeredDatasetKeys]) {
        expect(fn(ctx(roles))).not.toContain("users");
        expect(fn(ctx(roles))).not.toContain("accessRequests");
      }
    }
    // A Member is still offered just the My datasets.
    expect(offeredDatasetKeys(ctx(["Member"]))).toEqual([...MY_DATASET_KEYS]);
  });

  it("each dataset follows its own permission, including session-resolved permissions", () => {
    // Heads hold admin:access but not iam:manage.
    for (const role of ["HeadOfProjects", "HeadOfQA"]) {
      expect(offeredDatasetKeys(ctx([role]))).toContain("users");
      expect(offeredDatasetKeys(ctx([role]))).not.toContain("accessRequests");
    }
    // A tenant override that grants iam:manage alone (plus reports:read) offers only accessRequests.
    const iamOnly = ctx(["Custom"], ["reports:read", "iam:manage"]);
    expect(offeredDatasetKeys(iamOnly)).toContain("accessRequests");
    expect(offeredDatasetKeys(iamOnly)).not.toContain("users");
  });
});
