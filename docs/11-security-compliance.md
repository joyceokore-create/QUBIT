# 11 — Security & Compliance

QUBIT handles confidential organisational data for regulated financial groups. Security is a
build requirement, not an afterthought.

## Tenant isolation

- Postgres RLS is the primary control (see `04-multitenancy.md`). The app DB role is a
  non-superuser without `BYPASSRLS`.
- Cross-tenant access requires the explicit, audited super-admin switch.
- A cross-tenant isolation test gates every milestone.

## Secrets

- All secrets (`DATABASE_URL`, `AUTH_SECRET`, SSO client secrets) come from environment
  variables / a secret manager. Never hardcode; never commit `.env`.
- Do NOT copy any credentials from source documents (e.g. bootstrap admin logins in the
  QUBIT User Guide) into code, seeds, or docs. Generate fresh secrets and rotate on first use.
- `.env.example` lists variable names only, never values.

## Input & injection

- Validate every input with Zod at the boundary.
- Prisma parameterises all queries — no string-concatenated SQL. Raw SQL only for
  `set_config` in `withTenant()` and RLS migrations.
- Escape/encode output; React does this by default — avoid `dangerouslySetInnerHTML`.

## AuthN / AuthZ

- Password hashing with bcrypt/argon2; strong password policy; login rate limiting/lockout.
- TOTP MFA. Short-lived sessions; re-auth on expiry; sign-out clears session.
- Server-side permission checks on every mutating/reading endpoint (`rbac.ts`).
- Never trust client-supplied tenant/role/permission.

## Transport & storage

- TLS everywhere in staging/production.
- Encrypt sensitive fields at rest (e.g. `mfaSecret`).
- Principle of least privilege for the DB role and any integration credentials.

## OWASP checklist (apply during review)

- Injection — Prisma + Zod.
- Broken auth — Auth.js, MFA, rate limiting, session expiry.
- Broken access control — RLS + `rbac.ts` + tenant context; test cross-tenant + cross-role.
- SSRF — validate/allow-list any outbound URLs (webhooks, integrations, Phase D).
- Insecure deserialization — no untrusted deserialization; validate JSON with Zod.
- Security misconfig — secure headers, no verbose errors to clients, no secrets in logs.
- Sensitive data exposure — data classification below; no PII in logs.

## Data classification & PII

- Employee names/emails/phones are confidential personal data.
- **Do not** place customer PII, payment card data, or health information in free-text fields,
  comments, or document uploads. Add a UI note and server-side guardrails where feasible.
- Seed/test/fixture data must be clearly synthetic (`user_001`, `test@example.invalid`).
- Support soft-delete of users: scrub PII, invalidate password, revoke roles, keep FKs for
  audit (mirror QUBIT behaviour).

## Regulatory context (informational)

- Design toward alignment with the **Central Bank of Kenya** cybersecurity guidance and the
  **Kenya Data Protection Act** (and regional equivalents): audit logging, access control,
  encryption, and data-residency options (RLS makes per-region hosting straightforward).
- This is not a compliance attestation. Certification and legal interpretation sit with KCB
  and Riverbank Legal/Risk/Compliance teams — flag anything ambiguous for their review.

## Logging & audit

- Structured logs without secrets or PII.
- Business-level audit trail via `audit_log` (see `07-auth-rbac.md`).
- Log auth events (login success/failure, MFA, tenant switch) for monitoring.
