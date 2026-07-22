# Request-access ("Get started") Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marketing "Get started" CTAs open a login-styled request-access form that persists each submission and lets a super-admin review requests in-app.

**Architecture:** A new pre-auth route (`/request-access`) renders a form inside a shared `AuthShell` (extracted from the login canvas). Submissions POST to an unauthenticated route that writes a **system-level** `AccessRequest` row (no `tenant_id`, RBAC-gated reads). A new `/admin/access-requests` page lists requests and lets a super-admin mark them Reviewed/Dismissed, writing audit rows.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma + PostgreSQL, Zod, Tailwind v4 tokens, Vitest + RTL + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-request-access-flow-design.md`

## Global Constraints

- Package manager `pnpm`; Node 20 LTS+. Quality gates that MUST pass before "done": `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- TypeScript `strict`; no `any` without a written reason.
- Validate all external input with Zod. Parameterised queries only (Prisma).
- No secrets committed; no real/realistic PII — use synthetic placeholders (`user_001`, `test@example.invalid`).
- Every authenticated mutation writes an `audit_log` row (actor, tenant, entity, before/after).
- Files: kebab-case; PascalCase components; camelCase functions/vars. Conventional Commits.
- Multitenancy is mandatory on every data path **except** the one documented exception in this plan: the `access_request` system table (pre-tenant intake, RBAC-gated). This exception is recorded in `docs/04-multitenancy.md`.
- Brand/theme: reuse the existing `--l-*` login tokens and `.login-shell` canvas in `src/app/globals.css`; do not hard-code colors. Works in light + dark for both tenants' pre-auth theming.
- `tests/rls/**` run in the `node` env and require a migrated + seeded DB (`pnpm prisma migrate dev` then `pnpm prisma db seed`). `tests/unit/**` run in jsdom.

---

### Task 1: `AccessRequest` model, migration, and multitenancy exception

**Files:**
- Modify: `prisma/schema.prisma` (add model + enum near the other Phase models)
- Modify: `prisma/rls.sql` (documenting comment only — table intentionally excluded)
- Modify: `docs/04-multitenancy.md` (document the exception)
- Test: `tests/rls/access-request.test.ts`

**Interfaces:**
- Produces: Prisma model `AccessRequest { id, fullName, email, company, jobTitle, status, reviewedById, reviewedAt, createdAt }`, enum `AccessRequestStatus { NEW, REVIEWED, DISMISSED }`, DB table `access_request` with **no** RLS policy.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/rls/access-request.test.ts`:

```ts
// access_request is a SYSTEM table (no tenant_id): a requester belongs to no tenant yet.
// It must be creatable + readable via the bare prisma client, outside any withTenant() scope.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const TEST_EMAIL = "req-smoke@example.invalid";

describe("AccessRequest system table", () => {
  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: TEST_EMAIL } });
  });

  it("creates and reads a row via the bare client (no tenant context)", async () => {
    const created = await prisma.accessRequest.create({
      data: { fullName: "Test User", email: TEST_EMAIL, company: "Test Co", jobTitle: "Head of PMO" },
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("NEW");

    const found = await prisma.accessRequest.findFirst({ where: { email: TEST_EMAIL } });
    expect(found?.company).toBe("Test Co");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/rls/access-request.test.ts`
Expected: FAIL — `prisma.accessRequest` is `undefined` / TypeScript error "Property 'accessRequest' does not exist".

- [ ] **Step 3: Add the model + enum to the schema**

In `prisma/schema.prisma`, append (after the last model):

```prisma
// ── Access requests ("Get started" lead capture) ───────────────────────────
// SYSTEM table: intentionally has NO tenant_id — a requester belongs to no tenant yet.
// The one sanctioned exception to the tenant_id + RLS rule (see docs/04-multitenancy.md).
// Public INSERT via the bare prisma client; reads/updates are gated by RBAC (iam:manage),
// NOT by tenant RLS. Deliberately omitted from prisma/rls.sql's table array (RLS stays off).
model AccessRequest {
  id           String              @id @default(cuid())
  fullName     String              @map("full_name")
  email        String
  company      String
  jobTitle     String?             @map("job_title")
  status       AccessRequestStatus @default(NEW)
  reviewedById String?             @map("reviewed_by_id")
  reviewedAt   DateTime?           @map("reviewed_at")
  createdAt    DateTime            @default(now()) @map("created_at")

  @@index([status, createdAt])
  @@map("access_request")
}

enum AccessRequestStatus {
  NEW
  REVIEWED
  DISMISSED
}
```

- [ ] **Step 4: Create + apply the migration and regenerate the client**

Run: `pnpm prisma migrate dev --name access_request`
Expected: a new migration under `prisma/migrations/*_access_request/` is created and applied; `prisma generate` runs so `prisma.accessRequest` becomes available.

- [ ] **Step 5: Document the RLS exclusion + the exception**

In `prisma/rls.sql`, immediately after the header comment block (before the `DO $$`), add:

```sql
-- NOT tenant-scoped (intentional, like "tenant"): access_request captures pre-tenant
-- intake ("Get started" lead capture), so it carries no tenant_id and is deliberately
-- excluded from the table array below. Access is gated by RBAC (iam:manage) in the app
-- layer, not by RLS. See docs/04-multitenancy.md.
```

In `docs/04-multitenancy.md`, add a short subsection documenting: `access_request` is a system table with no `tenant_id`, no RLS policy, written by an unauthenticated public endpoint, and read/updated only behind `can(ctx, "iam:manage")`. It carries no cross-tenant data path.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/rls/access-request.test.ts`
Expected: PASS (2 assertions).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/rls.sql docs/04-multitenancy.md tests/rls/access-request.test.ts
git commit -m "feat(access-request): add system-level AccessRequest model + migration"
```

---

### Task 2: Zod schema for the request payload

**Files:**
- Create: `src/lib/access-request-schema.ts`
- Test: `tests/unit/access-request-schema.test.ts`

**Interfaces:**
- Produces: `accessRequestSchema` (Zod object) and `type AccessRequestInput = z.infer<typeof accessRequestSchema>`. Fields: `fullName: string`, `email: string` (lowercased, trimmed), `company: string`, `jobTitle?: string`, `companyUrl?: string` (honeypot). Shared by the public route (Task 3) and the form (Task 7).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/access-request-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accessRequestSchema } from "@/lib/access-request-schema";

const base = { fullName: "Ada K.", email: "ada@acme.example", company: "Acme" };

describe("accessRequestSchema", () => {
  it("accepts a valid minimal payload and drops empty jobTitle to undefined", () => {
    const r = accessRequestSchema.parse({ ...base, jobTitle: "" });
    expect(r.jobTitle).toBeUndefined();
  });

  it("trims and lowercases the email", () => {
    const r = accessRequestSchema.parse({ ...base, email: "  ADA@Acme.Example  " });
    expect(r.email).toBe("ada@acme.example");
  });

  it("rejects an invalid email", () => {
    expect(accessRequestSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(accessRequestSchema.safeParse({ email: "ada@acme.example" }).success).toBe(false);
  });

  it("rejects an over-long full name", () => {
    expect(accessRequestSchema.safeParse({ ...base, fullName: "x".repeat(121) }).success).toBe(false);
  });

  it("keeps the honeypot field optional", () => {
    const r = accessRequestSchema.parse({ ...base, companyUrl: "http://bot.example" });
    expect(r.companyUrl).toBe("http://bot.example");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/access-request-schema.test.ts`
Expected: FAIL — cannot find module `@/lib/access-request-schema`.

- [ ] **Step 3: Implement the schema**

Create `src/lib/access-request-schema.ts`:

```ts
import { z } from "zod";

/**
 * Validation for the public "Get started" request-access form. Shared by the client form
 * (src/app/(auth)/request-access/request-access-form.tsx) and the unauthenticated route
 * (src/app/api/access-request/route.ts). `companyUrl` is a honeypot: it is never rendered to
 * real users, so a non-empty value marks a bot (the route drops it silently).
 */
export const accessRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(190),
  company: z.string().trim().min(1, "Enter your company name.").max(160),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  companyUrl: z.string().max(200).optional(), // honeypot — must be empty for humans
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/access-request-schema.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/access-request-schema.ts tests/unit/access-request-schema.test.ts
git commit -m "feat(access-request): add shared Zod schema"
```

---

### Task 3: Public `POST /api/access-request` route

**Files:**
- Create: `src/app/api/access-request/route.ts`
- Test: `tests/rls/access-request-api.test.ts`

**Interfaces:**
- Consumes: `accessRequestSchema` (Task 2), `prisma` (`@/lib/db`), `checkRateLimit`/`recordFailure` (`@/lib/rate-limit`).
- Produces: `POST` handler. Responses: `{ ok: true }` (201) on success or honeypot; `{ error: { code, message } }` 400 on invalid; 429 when rate-limited.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/access-request-api.test.ts`:

```ts
// Exercises the unauthenticated public route against the real DB (node env).
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/access-request/route";
import { prisma } from "@/lib/db";

const EMAIL = "route-test@example.invalid";

function post(body: unknown, ip = "1.2.3.4") {
  return POST(
    new Request("http://localhost/api/access-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/access-request", () => {
  afterEach(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  it("stores a valid request and returns ok", async () => {
    const res = await post({ fullName: "Ada K.", email: EMAIL, company: "Acme", jobTitle: "PMO" });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const row = await prisma.accessRequest.findFirst({ where: { email: EMAIL } });
    expect(row?.company).toBe("Acme");
  });

  it("silently drops a honeypot submission without storing", async () => {
    const res = await post({ fullName: "Bot", email: EMAIL, company: "Acme", companyUrl: "http://bot" }, "5.6.7.8");
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const row = await prisma.accessRequest.findFirst({ where: { email: EMAIL } });
    expect(row).toBeNull();
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await post({ fullName: "", email: "nope", company: "" }, "9.9.9.9");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/rls/access-request-api.test.ts`
Expected: FAIL — cannot find module `@/app/api/access-request/route`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/access-request/route.ts`:

```ts
import { NextResponse } from "next/server";
import { accessRequestSchema } from "@/lib/access-request-schema";
import { prisma } from "@/lib/db";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";

/**
 * Unauthenticated public intake for the "Get started" request-access form. Writes a
 * system-level access_request row (no tenant context — see docs/04-multitenancy.md).
 * Rate-limited per IP (shared in-memory limiter) and honeypot-guarded against bots.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `access-request:${ip}`;
  if (!checkRateLimit(key).allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordFailure(key);
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    recordFailure(key);
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request." } }, { status: 400 });
  }

  const { fullName, email, company, jobTitle, companyUrl } = parsed.data;

  // Honeypot filled → almost certainly a bot. Ack success, store nothing.
  if (companyUrl) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  await prisma.accessRequest.create({ data: { fullName, email, company, jobTitle } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/rls/access-request-api.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/access-request/route.ts" tests/rls/access-request-api.test.ts
git commit -m "feat(access-request): add public POST /api/access-request route"
```

---

### Task 4: Admin service (list / review / count) + audit action

**Files:**
- Modify: `src/lib/audit.ts` (extend the `AuditAction` union)
- Create: `src/server/access-requests.ts`
- Test: `tests/rls/access-requests-admin.test.ts`

**Interfaces:**
- Consumes: `withTenant` (`@/lib/tenant`), `audit` (`@/lib/audit`), `prisma` (`@/lib/db`), `TenantContext`.
- Produces:
  - `listAccessRequests(): Promise<AccessRequest[]>` — NEW first, then newest.
  - `countNewAccessRequests(): Promise<number>`.
  - `reviewAccessRequest(ctx: Pick<TenantContext,"tenantId"|"userId">, id: string, status: "REVIEWED" | "DISMISSED"): Promise<AccessRequest>` — updates status + reviewer, writes an audit_log row. Throws `AccessRequestError` (with `.code`) if the row does not exist.
  - `class AccessRequestError extends Error { code: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/access-requests-admin.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import {
  listAccessRequests,
  countNewAccessRequests,
  reviewAccessRequest,
  AccessRequestError,
} from "@/server/access-requests";

const EMAIL = "admin-svc@example.invalid";
let ctx: TenantContext;

describe("access-request admin service", () => {
  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded data — run `pnpm prisma db seed` first.");
    ctx = { tenantId: kcb.id, userId: "test-ar-actor", roles: ["PlatformSuperAdmin"] };
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  afterAll(async () => {
    const rows = await prisma.accessRequest.findMany({ where: { email: EMAIL } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: rows.map((r) => r.id) } } });
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  it("reviewing sets status + reviewer and writes an audit row", async () => {
    const row = await prisma.accessRequest.create({
      data: { fullName: "Ada K.", email: EMAIL, company: "Acme" },
    });
    const before = await countNewAccessRequests();

    const updated = await reviewAccessRequest(ctx, row.id, "REVIEWED");
    expect(updated.status).toBe("REVIEWED");
    expect(updated.reviewedById).toBe(ctx.userId);
    expect(updated.reviewedAt).toBeInstanceOf(Date);

    expect(await countNewAccessRequests()).toBe(before - 1);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "access_request", entityId: row.id, action: "access_request_review" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].tenantId).toBe(ctx.tenantId);
    expect(audits[0].actorId).toBe(ctx.userId);
  });

  it("throws AccessRequestError for an unknown id", async () => {
    await expect(reviewAccessRequest(ctx, "does-not-exist", "DISMISSED")).rejects.toBeInstanceOf(
      AccessRequestError,
    );
  });

  it("lists NEW requests before reviewed ones", async () => {
    await prisma.accessRequest.create({ data: { fullName: "New One", email: EMAIL, company: "Beta" } });
    const list = await listAccessRequests();
    const firstNewIdx = list.findIndex((r) => r.status === "NEW");
    const firstReviewedIdx = list.findIndex((r) => r.status !== "NEW");
    if (firstReviewedIdx !== -1) expect(firstNewIdx).toBeLessThan(firstReviewedIdx);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/rls/access-requests-admin.test.ts`
Expected: FAIL — cannot find module `@/server/access-requests`.

- [ ] **Step 3: Extend the audit action union**

In `src/lib/audit.ts`, add `"access_request_review"` to the `AuditAction` union:

```ts
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "tenant_switch"
  | "mfa_enroll"
  | "role_grant"
  | "role_revoke"
  | "access_request_review";
```

- [ ] **Step 4: Implement the service**

Create `src/server/access-requests.ts`:

```ts
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import type { AccessRequest } from "@prisma/client";

/** Thrown for expected admin-review failures (e.g. unknown id). Carries a stable `code`. */
export class AccessRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AccessRequestError";
    this.code = code;
  }
}

/** System read (no tenant scope): NEW first, then newest. */
export function listAccessRequests(): Promise<AccessRequest[]> {
  return prisma.accessRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/** Count of pending (NEW) requests — feeds the admin-nav badge. */
export function countNewAccessRequests(): Promise<number> {
  return prisma.accessRequest.count({ where: { status: "NEW" } });
}

/**
 * Mark a request Reviewed/Dismissed. The access_request UPDATE is a system-table write, but
 * we run it inside withTenant(ctx) so the audit_log row is tenant-scoped to the reviewing
 * admin and atomic with the status change (docs/07-auth-rbac.md).
 */
export async function reviewAccessRequest(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  id: string,
  status: "REVIEWED" | "DISMISSED",
): Promise<AccessRequest> {
  const existing = await prisma.accessRequest.findUnique({ where: { id } });
  if (!existing) throw new AccessRequestError("NOT_FOUND", "Access request not found.");

  return withTenant(ctx, async (tx) => {
    const updated = await tx.accessRequest.update({
      where: { id },
      data: { status, reviewedById: ctx.userId, reviewedAt: new Date() },
    });
    await audit(tx, ctx, {
      action: "access_request_review",
      entityType: "access_request",
      entityId: id,
      before: { status: existing.status },
      after: { status },
    });
    return updated;
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/rls/access-requests-admin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit.ts src/server/access-requests.ts tests/rls/access-requests-admin.test.ts
git commit -m "feat(access-request): admin review service + audit action"
```

---

### Task 5: Admin routes — review (PATCH) + count (GET)

**Files:**
- Create: `src/app/api/admin/access-requests/[id]/route.ts`
- Create: `src/app/api/admin/access-requests/count/route.ts`
- Test: `tests/unit/access-request-admin-routes.test.ts`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/api-guard`), `reviewAccessRequest`/`countNewAccessRequests`/`AccessRequestError` (Task 4).
- Produces: `PATCH /api/admin/access-requests/[id]` (body `{ status }`) → `{ ok: true }`; `GET /api/admin/access-requests/count` → `{ new: number }`. Both `iam:manage`-gated (401/403 via the guard).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/access-request-admin-routes.test.ts` (jsdom unit test; the guard + service are mocked so this stays deterministic and DB-free):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-guard", () => ({
  requirePermission: vi.fn(),
}));
vi.mock("@/server/access-requests", () => ({
  reviewAccessRequest: vi.fn(),
  countNewAccessRequests: vi.fn(),
  AccessRequestError: class extends Error {
    code: string;
    constructor(code: string, m: string) { super(m); this.code = code; }
  },
}));

import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, countNewAccessRequests } from "@/server/access-requests";
import { PATCH } from "@/app/api/admin/access-requests/[id]/route";
import { GET } from "@/app/api/admin/access-requests/count/route";

const okCtx = { ctx: { tenantId: "t1", userId: "u1", roles: ["PlatformSuperAdmin"] } };
const params = { params: Promise.resolve({ id: "req_1" }) };

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/admin/access-requests/req_1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    params,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("admin access-request routes", () => {
  it("PATCH forwards the guard's 403 when not permitted", async () => {
    const denied = { response: new Response(null, { status: 403 }) };
    (requirePermission as unknown as vi.Mock).mockResolvedValue(denied);
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(403);
    expect(reviewAccessRequest).not.toHaveBeenCalled();
  });

  it("PATCH reviews the request when permitted", async () => {
    (requirePermission as unknown as vi.Mock).mockResolvedValue(okCtx);
    (reviewAccessRequest as unknown as vi.Mock).mockResolvedValue({ id: "req_1", status: "REVIEWED" });
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(reviewAccessRequest).toHaveBeenCalledWith(okCtx.ctx, "req_1", "REVIEWED");
  });

  it("PATCH rejects an invalid status with 400", async () => {
    (requirePermission as unknown as vi.Mock).mockResolvedValue(okCtx);
    const res = await patch({ status: "BOGUS" });
    expect(res.status).toBe(400);
  });

  it("GET count returns the pending count", async () => {
    (requirePermission as unknown as vi.Mock).mockResolvedValue(okCtx);
    (countNewAccessRequests as unknown as vi.Mock).mockResolvedValue(3);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ new: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/access-request-admin-routes.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Implement the PATCH route**

Create `src/app/api/admin/access-requests/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, AccessRequestError } from "@/server/access-requests";

const BodySchema = z.object({ status: z.enum(["REVIEWED", "DISMISSED"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid status." } }, { status: 400 });
  }

  try {
    await reviewAccessRequest(guard.ctx, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Implement the count route**

Create `src/app/api/admin/access-requests/count/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { countNewAccessRequests } from "@/server/access-requests";

export async function GET() {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ new: await countNewAccessRequests() });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/access-request-admin-routes.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/admin/access-requests" tests/unit/access-request-admin-routes.test.ts
git commit -m "feat(access-request): admin PATCH + count routes"
```

---

### Task 6: Extract shared `AuthShell` and refactor the login form

**Files:**
- Create: `src/app/(auth)/auth-shell.tsx`
- Modify: `src/app/(auth)/login/login-form.tsx` (render inside `AuthShell`; remove the duplicated wrapper/toggle/card/wordmark markup)
- Test: `tests/unit/login-form.test.tsx` (existing — must still pass as a regression gate)

**Interfaces:**
- Produces: `AuthShell` component:
  ```ts
  function AuthShell({ brand, children }: { brand: string; children: React.ReactNode }): JSX.Element
  ```
  Renders the `.login-shell` backdrop, the Lufga font-var scope, the top-right `ThemeToggle`, the ghost "QUBIT" wordmark, and a centered card (`--l-*` tokens + `--login-brand: brand`) wrapping `children`. Exports nothing else.
- Consumes: `ThemeToggle` (`@/components/theme/theme-toggle`).

- [ ] **Step 1: Confirm the regression test passes today**

Run: `pnpm vitest run tests/unit/login-form.test.tsx`
Expected: PASS (baseline before refactor).

- [ ] **Step 2: Create `AuthShell`**

Create `src/app/(auth)/auth-shell.tsx` (move the wrapper markup out of the current login form verbatim; the card container + boxShadow are token-based and shared):

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shared pre-auth canvas for the login + request-access screens. The atmospheric backdrop
 * (near-black base + navy/brand glows + ghost wordmark) is identical in light and dark; only
 * the card flips (bright light card / dark glass card) via the --l-* tokens in globals.css.
 * `brand` sets --login-brand on the card (login passes the resolved tenant brand; request
 * access passes the product green var(--pbrand)).
 */
export function AuthShell({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <div
      className="login-shell relative min-h-screen w-full font-sans"
      style={
        {
          background: [
            "radial-gradient(ellipse 60% 50% at 15% 25%, var(--l-glow-navy), transparent 60%)",
            "radial-gradient(ellipse 50% 50% at 85% 80%, var(--l-glow-brand), transparent 65%)",
            "var(--l-bg)",
          ].join(", "),
          "--font-display": "var(--font-lufga)",
          "--font-body": "var(--font-lufga)",
        } as CSSProperties
      }
    >
      {/* Backdrop is dark in both themes, so the toggle keeps the topbar (light-on-glass) look. */}
      <ThemeToggle className="absolute right-[18px] top-[18px] z-20" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div
          className="rounded-2xl border border-[var(--l-card-bd)] bg-[var(--l-card-bg)] p-5 backdrop-blur-sm [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both] sm:p-6"
          style={
            {
              "--login-brand": brand,
              boxShadow: ["var(--l-card-sh)", "0 20px 70px -30px var(--l-card-glow)"].join(", "),
            } as CSSProperties
          }
        >
          {children}
        </div>
      </main>

      {/* Giant faded background wordmark (Lumi motif) — behind the card, clipped to the viewport. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 flex max-h-[38vh] justify-between overflow-hidden px-4 font-black uppercase leading-none text-[var(--l-wm)]"
        style={{ fontSize: "clamp(40px, 11vw, 200px)" }}
      >
        {"QUBIT".split("").map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Refactor `login-form.tsx` to use `AuthShell`**

In `src/app/(auth)/login/login-form.tsx`:
- Add `import { AuthShell } from "../auth-shell";`.
- Remove the now-unused `ThemeToggle` import and the `CSSProperties` usage tied to the wrapper if no longer needed (keep `CSSProperties`/`FormEvent` imports only if still referenced).
- Replace the outer `<div className="login-shell …"> … </div>` (the wrapper, the `ThemeToggle`, the `<main>…<div card>` open, and the trailing ghost-wordmark `<div>`) with `<AuthShell brand={loginBrand}> … </AuthShell>`, keeping the card's inner content (logo button, `h1`, `p`, `form`, demo block, footer) as the children.
- Delete the local `formStyle`/`boxShadow` objects (now owned by `AuthShell`).

The resulting return is:

```tsx
  return (
    <AuthShell brand={loginBrand}>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 flex items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
      >
        <BrandLogo variant="color" className="h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="hidden h-7 w-auto dark:block" />
      </button>

      <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Sign in</h1>
      <p className="mb-5 text-[13px] text-[var(--l-ink-2)]">Your organization is resolved from your email — no picker.</p>

      {/* …existing <form> …, demo quick sign-in block, and footer paragraph unchanged… */}
    </AuthShell>
  );
```

(`loginBrand` is the existing local: `const loginBrand = resolved && org.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";`.)

- [ ] **Step 4: Run the regression test + typecheck**

Run: `pnpm vitest run tests/unit/login-form.test.tsx && pnpm typecheck`
Expected: PASS; no type errors. (If the login test asserts on the toggle/wordmark, it still finds them — they render via `AuthShell`.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/auth-shell.tsx" "src/app/(auth)/login/login-form.tsx"
git commit -m "refactor(auth): extract shared AuthShell from login canvas"
```

---

### Task 7: Request-access form + page

**Files:**
- Create: `src/app/(auth)/request-access/page.tsx`
- Create: `src/app/(auth)/request-access/request-access-form.tsx`
- Test: `tests/unit/request-access-form.test.tsx`

**Interfaces:**
- Consumes: `AuthShell` (Task 6), `accessRequestSchema` (Task 2), `BrandLogo` (`@/components/brand/brand-logo`), `POST /api/access-request` (Task 3), `GET /api/auth/resolve-org` (existing).
- Produces: `RequestAccessForm` (client component) + `RequestAccessPage` (server component). No exported types consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/request-access-form.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestAccessForm } from "@/app/(auth)/request-access/request-access-form";

beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/api/auth/resolve-org")) {
      return Promise.resolve(new Response(JSON.stringify({ found: false }), { status: 404 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 }));
  });
});
afterEach(() => vi.restoreAllMocks());

describe("RequestAccessForm", () => {
  it("shows a validation error when required fields are empty", async () => {
    render(<RequestAccessForm />);
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));
    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
  });

  it("submits and shows the confirmation state", async () => {
    render(<RequestAccessForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Ada K." } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "ada@acme.example" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));
    expect(await screen.findByText(/request received/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@acme.example/i)).toBeInTheDocument();
  });

  it("nudges to sign in when the email domain is a known tenant", async () => {
    (global.fetch as unknown as vi.Mock).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/resolve-org")) {
        return Promise.resolve(new Response(JSON.stringify({ found: true, tenantName: "KCB Group", tenantSlug: "kcb" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    });
    render(<RequestAccessForm />);
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "sam@kcb.example.invalid" } });
    expect(await screen.findByText(/already uses qubit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/request-access-form.test.tsx`
Expected: FAIL — cannot find the form module.

- [ ] **Step 3: Implement the form component**

Create `src/app/(auth)/request-access/request-access-form.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AuthShell } from "../auth-shell";
import { accessRequestSchema } from "@/lib/access-request-schema";

const INPUT_CLASS =
  "box-border w-full rounded-[11px] border border-[var(--l-field-bd)] bg-[var(--l-field-bg)] px-[14px] py-2.5 text-[13.5px] text-[var(--l-ink)] outline-none transition-colors placeholder:text-[var(--l-ph)] focus:border-[color-mix(in_oklab,var(--login-brand)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";
const LABEL_CLASS = "mb-1 block text-[12px] font-semibold text-[var(--l-ink-2)]";

function looksLikeCompleteDomain(email: string): boolean {
  const domain = email.split("@")[1];
  return Boolean(domain && domain.includes(".") && !domain.endsWith("."));
}

export function RequestAccessForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyUrl, setCompanyUrl] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [knownOrg, setKnownOrg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reuse the login org-resolver: if the work-email domain is already a QUBIT tenant, nudge
  // the visitor to sign in rather than request access.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!looksLikeCompleteDomain(email)) {
      setKnownOrg(null);
      return;
    }
    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/resolve-org?email=${encodeURIComponent(email)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setKnownOrg(data.tenantName ?? null);
        } else {
          setKnownOrg(null);
        }
      } catch {
        // resolver is a nicety, not a gate
      }
    }, 400);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = accessRequestSchema.safeParse({ fullName, email, company, jobTitle, companyUrl });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setLoading(false);
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setLoading(false);
      setError("Network error. Please try again.");
    }
  }

  if (done) {
    return (
      <AuthShell brand="var(--pbrand)">
        <BrandLogo variant="color" className="mb-4 h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="mb-4 hidden h-7 w-auto dark:block" />
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Request received</h1>
        <p className="mb-5 text-[13px] leading-[1.6] text-[var(--l-ink-2)]">
          Thanks — we&apos;ll be in touch at <span className="font-bold text-[var(--l-ink)]">{email}</span>.
        </p>
        <Link href="/login" className="text-[12px] font-semibold text-[var(--login-brand)] hover:underline">
          ‹ Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell brand="var(--pbrand)">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 flex items-center gap-[11px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
      >
        <BrandLogo variant="color" className="h-7 w-auto dark:hidden" />
        <BrandLogo variant="night" className="hidden h-7 w-auto dark:block" />
      </button>

      <h1 className="mb-1 text-[22px] font-semibold tracking-[-.4px] text-[var(--l-ink)]">Request access</h1>
      <p className="mb-5 text-[13px] text-[var(--l-ink-2)]">Tell us about your organization and we&apos;ll reach out.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <div>
          <label htmlFor="fullName" className={LABEL_CLASS}>Full name</label>
          <input id="fullName" type="text" autoComplete="name" className={INPUT_CLASS} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>Work email</label>
          <input id="email" type="email" autoComplete="email" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />
          {knownOrg && (
            <p className="mt-1.5 text-[11.5px] text-[var(--l-ink-3)]" aria-live="polite">
              {knownOrg} already uses QUBIT —{" "}
              <Link href="/login" className="font-semibold text-[var(--login-brand)] hover:underline">sign in</Link> instead.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="company" className={LABEL_CLASS}>Company name</label>
          <input id="company" type="text" autoComplete="organization" className={INPUT_CLASS} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label htmlFor="jobTitle" className={LABEL_CLASS}>Job title <span className="font-normal text-[var(--l-ink-3)]">(optional)</span></label>
          <input id="jobTitle" type="text" autoComplete="organization-title" className={INPUT_CLASS} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>

        {/* Honeypot — visually hidden, never shown to real users. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="companyUrl">Company URL</label>
          <input id="companyUrl" type="text" tabIndex={-1} autoComplete="off" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-[12px] text-[var(--l-err)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-[11px] px-[13px] py-[11px] text-[13.5px] font-bold text-[var(--onbrand)] outline-none transition-transform hover:-translate-y-[2px] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--login-brand)] disabled:opacity-60"
          style={{ background: "var(--login-brand)", boxShadow: "0 4px 20px color-mix(in oklab, var(--login-brand) var(--glowA), transparent)" }}
        >
          {loading ? "Sending…" : "Request access"}
        </button>
      </form>

      <p className="mt-5 text-[12px] text-[var(--l-ink-3)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--login-brand)] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/(auth)/request-access/page.tsx`:

```tsx
import type { Metadata } from "next";
import { RequestAccessForm } from "./request-access-form";

export const metadata: Metadata = { title: "Request access — QUBIT" };

// Request access ("Get started"). The form renders its own full-screen brand canvas via AuthShell.
export default function RequestAccessPage() {
  return <RequestAccessForm />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/request-access-form.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/request-access" tests/unit/request-access-form.test.tsx
git commit -m "feat(access-request): request-access form + page"
```

---

### Task 8: Wire CTAs, admin nav tab, and pending-count badge

**Files:**
- Modify: `src/components/marketing/hero.tsx` (~line 104: `href="/login"` → `/request-access`)
- Modify: `src/components/marketing/marketing-header.tsx` (~lines 114 + 171: the two "Get started" `href="/login"` → `/request-access`; leave the "Sign in" links)
- Modify: `src/app/(app)/admin/admin-header.tsx` (add tab + client-side pending-count badge)
- Test: `tests/unit/landing-page.test.tsx` (extend/adjust the CTA assertion)

**Interfaces:**
- Consumes: `GET /api/admin/access-requests/count` (Task 5).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write/adjust the failing test**

In `tests/unit/landing-page.test.tsx`, add (or adapt an existing CTA test) an assertion that the hero "Get started" links to `/request-access`. Example addition:

```tsx
it("points Get started at the request-access route", () => {
  render(<Hero />); // use the file's existing render helper/imports
  const cta = screen.getAllByRole("link", { name: /get started/i })[0];
  expect(cta).toHaveAttribute("href", "/request-access");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/landing-page.test.tsx`
Expected: FAIL — current href is `/login`.

- [ ] **Step 3: Repoint the three "Get started" CTAs**

In `src/components/marketing/hero.tsx` and `src/components/marketing/marketing-header.tsx`, change each **"Get started"** `<Link href="/login" …>` to `href="/request-access"`. Do **not** change the "Sign in" links (they stay `/login`). There are three Get-started links total (hero ×1, header desktop ×1, header mobile ×1).

- [ ] **Step 4: Add the admin nav tab + pending-count badge**

In `src/app/(app)/admin/admin-header.tsx`:
- Add to the `TABS` array: `{ label: "Access requests", href: "/admin/access-requests" }`.
- Add a client fetch for the pending count and render it as a badge on that tab. Add near the top of the component body:

```tsx
import { useEffect, useState } from "react";
// …existing imports…

// inside AdminHeader(), before `return`:
const [newCount, setNewCount] = useState(0);
useEffect(() => {
  let active = true;
  fetch("/api/admin/access-requests/count")
    .then((r) => (r.ok ? r.json() : { new: 0 }))
    .then((d) => { if (active) setNewCount(d.new ?? 0); })
    .catch(() => {});
  return () => { active = false; };
}, []);
```

- In the tab `.map(...)`, render a badge when `t.href === "/admin/access-requests" && newCount > 0`:

```tsx
{t.label}
{t.href === "/admin/access-requests" && newCount > 0 && (
  <span className="ml-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold leading-[16px] text-[var(--onbrand)]">
    {newCount}
  </span>
)}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/unit/landing-page.test.tsx && pnpm typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/hero.tsx src/components/marketing/marketing-header.tsx "src/app/(app)/admin/admin-header.tsx" tests/unit/landing-page.test.tsx
git commit -m "feat(access-request): point Get started at request-access + admin nav badge"
```

---

### Task 9: Admin review page

**Files:**
- Create: `src/app/(app)/admin/access-requests/page.tsx`
- Create: `src/app/(app)/admin/access-requests/access-requests-client.tsx`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`), `can` (`@/lib/rbac`), `Forbidden` (`@/components/forbidden`), `AdminHeader` (`../admin-header`), `listAccessRequests` (Task 4), `PATCH /api/admin/access-requests/[id]` (Task 5).
- Produces: the `/admin/access-requests` route (final consumer; nothing downstream).

- [ ] **Step 1: Implement the server page**

Create `src/app/(app)/admin/access-requests/page.tsx` (mirrors `admin/audit/page.tsx`):

```tsx
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { listAccessRequests } from "@/server/access-requests";
import { AccessRequestsClient } from "./access-requests-client";

export default async function AdminAccessRequestsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const rows = await listAccessRequests();
  const newCount = rows.filter((r) => r.status === "NEW").length;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader subtitle={`${newCount} new · ${rows.length} total · request-access submissions`} />
      <AccessRequestsClient
        rows={rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          company: r.company,
          jobTitle: r.jobTitle,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 2: Implement the client table**

Create `src/app/(app)/admin/access-requests/access-requests-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Row {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  status: "NEW" | "REVIEWED" | "DISMISSED";
  createdAt: string;
}

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW = "grid grid-cols-[120px_minmax(0,1.2fr)_minmax(0,1fr)_110px_150px] items-center gap-3.5 p-[10px_18px]";

const STATUS_STYLE: Record<Row["status"], string> = {
  NEW: "bg-[var(--okbg)] text-[var(--ok)]",
  REVIEWED: "bg-[var(--wash2)] text-[var(--ink3)]",
  DISMISSED: "bg-[var(--wash2)] text-[var(--ink4)]",
};

export function AccessRequestsClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function review(id: string, status: "REVIEWED" | "DISMISSED") {
    setBusy(id);
    try {
      await fetch(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${ROW} border-b border-[var(--hair)] font-mono text-[9px] font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
            <span>When</span><span>Requester</span><span>Company</span><span>Status</span><span>Actions</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className={`${ROW} border-b border-[var(--hair2)] last:border-0 hover:bg-[var(--wash)]`}>
              <span className="font-mono text-[10px] text-[var(--ink4)]">{format(new Date(r.createdAt), "MMM d HH:mm")}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-[var(--ink2)]">{r.fullName}{r.jobTitle ? ` · ${r.jobTitle}` : ""}</span>
                <span className="block truncate text-[11px] text-[var(--ink4)]">{r.email}</span>
              </span>
              <span className="truncate text-[12px] text-[var(--ink3)]">{r.company}</span>
              <span className={`justify-self-start rounded-[5px] px-2 py-[3px] text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status.toLowerCase()}</span>
              <span className="flex gap-1.5">
                <button type="button" disabled={busy === r.id || r.status === "REVIEWED"} onClick={() => review(r.id, "REVIEWED")}
                  className="rounded-[6px] border border-[var(--hair)] px-2 py-1 text-[11px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--brand)] disabled:opacity-40">
                  Reviewed
                </button>
                <button type="button" disabled={busy === r.id || r.status === "DISMISSED"} onClick={() => review(r.id, "DISMISSED")}
                  className="rounded-[6px] border border-[var(--hair)] px-2 py-1 text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:border-[var(--bad)] disabled:opacity-40">
                  Dismiss
                </button>
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="p-8 text-center text-[12px] text-[var(--ink5)]">No access requests yet.</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify page renders + typecheck**

Run: `pnpm typecheck`
Expected: no type errors. Manually: sign in as a `PlatformSuperAdmin`, visit `/admin/access-requests`, confirm the list renders and Reviewed/Dismiss update the row (page refreshes); a non-admin gets the Forbidden screen.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/access-requests"
git commit -m "feat(access-request): admin review page"
```

---

### Task 10: Synthetic seed data + full-suite verification

**Files:**
- Modify: `prisma/seed.ts` (add 2 clearly-synthetic access requests, idempotent)

- [ ] **Step 1: Add idempotent synthetic seed rows**

In `prisma/seed.ts`, near the end of the main seed function, add (adjust to the file's existing style/helpers):

```ts
// Synthetic "Get started" requests so the admin review page isn't empty in demos.
// Clearly non-real placeholders only (no real PII).
const SEED_REQUESTS = [
  { fullName: "Demo Requester 001", email: "req_001@example.invalid", company: "Northwind Demo Ltd", jobTitle: "Head of PMO" },
  { fullName: "Demo Requester 002", email: "req_002@example.invalid", company: "Globex Sample Inc", jobTitle: "Programme Director" },
];
for (const r of SEED_REQUESTS) {
  const exists = await prisma.accessRequest.findFirst({ where: { email: r.email } });
  if (!exists) await prisma.accessRequest.create({ data: r });
}
```

- [ ] **Step 2: Re-seed**

Run: `pnpm prisma db seed`
Expected: completes; running it again does not duplicate the two rows (idempotent).

- [ ] **Step 3: Full quality gates**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(access-request): seed synthetic demo requests"
```

---

## Self-Review

**Spec coverage:**
- Routing & CTAs → Tasks 7 (route), 8 (repoint 3 CTAs + Sign-in untouched). ✅
- Shared AuthShell refactor → Task 6. ✅
- Form UI (4 fields, brand, org hint, honeypot, success state, motion) → Task 7. ✅
- Data model + tenant exception + audit → Tasks 1 (model/migration/docs), 4 (audit action). ✅
- Public API (Zod, honeypot, rate-limit, 400) → Tasks 2 + 3. ✅
- Admin review surface (page, service, routes, nav badge) → Tasks 4, 5, 8, 9. ✅
- Error/edge states → covered in Tasks 3 (400/429/honeypot), 5 (401/403/404/400), 7 (validation/network/success), 9 (empty state, idempotent action). ✅
- Testing (schema, API, RBAC, audit, form, RLS-exclusion note) → Tasks 1–5, 7, 8. ✅
- DoD (both themes, migration, docs, gates) → Tasks 6/7 (theme via shared tokens), 1 (migration/docs), 10 (gates). ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code; no "handle errors" hand-waves. ✅

**Type consistency:** `reviewAccessRequest(ctx, id, status)`, `listAccessRequests()`, `countNewAccessRequests()`, `AccessRequestError.code`, `accessRequestSchema`/`AccessRequestInput`, `AuthShell({ brand, children })` — names/signatures match across Tasks 4, 5, 6, 7, 9. Audit action string `"access_request_review"` matches between Task 4 impl and its test. ✅
