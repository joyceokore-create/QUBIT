# 03 — Dependencies

Pin to these major versions. If a newer major has shipped by build time, note the change in
the PR rather than silently upgrading. Use **pnpm** and **Node 20 LTS+**.

## Scaffold

```bash
pnpm create next-app@latest qubit --typescript --tailwind --eslint --app --src-dir --use-pnpm
cd qubit
```

## Runtime dependencies

```bash
pnpm add @prisma/client zod @tanstack/react-query
pnpm add next-auth@beta @auth/prisma-adapter
pnpm add recharts lucide-react clsx tailwind-merge class-variance-authority
pnpm add date-fns
pnpm add otplib qrcode           # TOTP MFA (Phase A/D)
pnpm add bcryptjs                # password hashing (Milestone 2) — this doc mandated
                                  # bcrypt hashing (docs/11-security-compliance.md,
                                  # NFR-04) but omitted the package; bcryptjs is pure JS
                                  # (no native build step, Node/edge-friendly).
```

| Package | Version (major) | Why |
|---------|-----------------|-----|
| next | 15.x | App Router, Server Components, Route Handlers |
| react / react-dom | 19.x | UI |
| typescript | 5.x | type safety (`strict`) |
| @prisma/client | 6.x | typed DB access |
| prisma (dev) | 6.x | migrations, schema, seed |
| next-auth (Auth.js) | 5.x (beta) | authentication/session |
| @auth/prisma-adapter | latest | persist auth in Postgres |
| zod | 3.x | input/DTO validation |
| @tanstack/react-query | 5.x | client data fetching/caching |
| tailwindcss | 4.x | styling |
| recharts | 2.x | charts (KPI trends, progress) |
| lucide-react | latest | icons (matches dashboard iconography) |
| class-variance-authority, clsx, tailwind-merge | latest | component variants/classes |
| date-fns | 3.x | date formatting (due dates, milestones) |
| otplib, qrcode | latest | TOTP MFA enrolment |

## UI component library (shadcn/ui)

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card table badge dialog sheet tabs \
  dropdown-menu input select tooltip avatar progress separator sonner
```

`sheet` powers the slide-in detail panel; `sonner` powers toasts/notifications.

## Dev / test dependencies

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
pnpm add -D @playwright/test
pnpm add -D eslint-config-prettier prettier
pnpm add -D tsx                 # run seed.ts / scripts
```

| Package | Purpose |
|---------|---------|
| vitest, @testing-library/* , jsdom | unit/component tests |
| @playwright/test | end-to-end + cross-tenant isolation flows |
| prettier, eslint-config-prettier | formatting |
| tsx | run TypeScript scripts (seed) |

## Fonts

The design uses **Inter** (body) and **Syne** (display/headings). Load via `next/font/google`
in the root layout — do not use a raw `@import` in production CSS.

```ts
import { Inter, Syne } from "next/font/google";
```

## Local Postgres (Docker)

```bash
docker run --name qubit-pg -e POSTGRES_USER=qubit -e POSTGRES_PASSWORD=qubit \
  -e POSTGRES_DB=qubit -p 5432:5432 -d postgres:17
```

## package.json scripts (target)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "prisma db seed"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

## Explicitly NOT used

- No client-side `localStorage`/`sessionStorage` for auth or tenant state — server session only.
- No cross-tenant caching layers that could bleed data between tenants.
- No ORM other than Prisma; no raw string-concatenated SQL.
