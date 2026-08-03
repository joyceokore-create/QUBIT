# 19 — Consolidation & Module Revamp Plan (Ideation → Market Rollout)

**Status:** Proposed · 2026-08-03
**Owner:** Joyce Okore
**Builds on:** `16-revamp-plan.md`, `17-role-dashboards-spec.md`,
`18-delivery-tracking-boards-reporting-spec.md`, `15-phase6-delivery-workflow-plan.md`
**Execution rule:** one milestone at a time, stop for review. DoD per `CLAUDE.md`.
**Driver:** stop rebuilding; consolidate what already works, turn on what's dark, and
build the one missing link in the reporting chain (PM → Head of PMs).

---

## 1. Why this plan exists — the "round and round" diagnosis

An audit on 2026-08-03 (three read-only specialist reviews — security, code quality, NFR
— plus a dependency scan) found something worth saying plainly: **QUBIT is in far better
shape than it feels.** The reason it feels like circling is not that the product is
broken. It is that:

1. **Three finished subsystems are switched off.** YouTrack sync, email delivery, and
   GitHub commit automation are all built, tested, and gated behind `FEATURE_*` flags
   that default OFF (`src/lib/flags.ts`). Work that shipped is invisible, so it reads as
   "still not done."
2. **The docs and the code disagree.** `CLAUDE.md`/`docs/03` promise Recharts + TanStack
   Query; the code uses neither. `docs/10` has no status markers; `docs/15` never marks
   6.3–6.5 as shipped though they are. Every fresh planning pass re-litigates what's
   actually built.
3. **Dead weight hides live progress.** ~490 lines of an abandoned "ClickUp" schema, ten
   orphaned components, and stale git worktrees make the tree look half-finished.
4. **One genuine gap in your chain.** The flow you asked for — member → PM → **Head of
   PMs** → executive — is built end-to-end *except* the Head-of-PMs roll-up layer. That
   missing rung is real work, and it is section 6.
5. **Operational immaturity, not product immaturity.** No database backups, no health
   endpoint, no logging/monitoring, no rollback path. This is what makes a genuinely
   well-built app *feel* unstable.

The decision that follows from the audit: **consolidate and finish. Do not rebuild.**
No module scored "rebuild." The plan below is cleanup first, then a module-by-module
revamp that mostly means *turning things on, hardening them, and wiring the last rung*.

---

## 2. Audit verdict (evidence-based, 2026-08-03)

Overall code-quality score **83/100** (B). Security posture: strong foundation, specific
fixable gaps. NFR: solid on the things the team invested in (multitenancy/RLS, audit,
secure connectors, CI test gates), weak on *operational* NFRs.

### 2.1 Per-module verdict

| Module | Verdict | What it needs |
|---|---|---|
| Onboarding / auth | **Keep + security fix** | Fix the forced-password-reset bypass; add MFA recovery/reset. Otherwise sound (bcrypt-12, reuse history, RLS-safe). |
| Dashboards (exec/PM/dev/QA/impl presets) | **Keep (light refactor)** | Merge the `dashboard.ts` / `dashboard-v2.ts` naming fossils; shared engines are already correct. |
| Boards + tasks | **Refactor** | Split the 846-line `project-tasks.ts` (queries / status machine / LLM plan-gen are three concerns). Behaviour and tests are good. |
| Reporting stack (member-reports / checkins / q-report / Friday job) | **Keep** | Best-designed area in the repo. Needs the Head-of-PMs rung (§6) and share-link lifecycle fixes. |
| Connectors (YouTrack / GitHub / mail) | **Keep + turn on + harden** | Enable the flags; add timeouts/retry to external calls. YouTrack SSRF guard is the quality high-water mark. |
| Admin / RBAC | **Keep** | Adopt the shared error envelope; fix `iam:manage` catalogue gap; finish the coarse→fine permission migration. |
| Platform core (RLS, jobs, events) | **Keep** | Fix `rls.sql` drift (below); add security headers, real rate limiting, operational hardening (§7). |

### 2.2 Security findings that gate the revamp

These are fixed in the cleanup milestone (M-C) before any feature work, because they sit
on the critical path of the modules you're revamping.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Critical (dep)** | `next-auth@5.0.0-beta.31` — advisory GHSA-x445-f3h2-j279: config errors can make auth checks **fail open**; also homoglyph email bypass, uncaught error on malformed Bearer headers | Upgrade to `>=5.0.0-beta.32` / `@auth/core >=0.41.3`. One-line bump, highest priority. |
| 2 | **High** | Forced-password-reset bypass — `mustChangePassword` cleared by client-supplied session data (`src/lib/auth.config.ts:28-30`); admin temp passwords never truly retire | Re-read the flag from DB in the `jwt` callback; drop the client-trusted path. |
| 3 | **High** | Live secrets on local disk (`.env`) — verified **never committed** to git | Precautionary rotation checklist; add `.env` to backup exclusions; add `gitleaks` to CI. |
| 4 | **Medium** | `rls.sql` missing 15 tenant-owned tables — DB is protected by per-migration policies, but the *documented source of truth* is wrong (incl. `member_report`) | Regenerate `rls.sql` from schema; add a test asserting every `tenant_id` table has a policy. |
| 5 | **Medium** | Share links: no expiry, no revocation, view skips `canAccessReport` → a token-holder can read a colleague's personal report | Add `expiresAt`/`revokedAt`, a revoke route, and re-run the access check on read. |
| 6 | **Medium** | No rate limiting on authenticated routes; login limiter is email-only + in-memory | Add per-user + per-IP limits; move to a shared store before multi-instance. |
| 7 | **Medium** | GitHub webhook does a pre-auth all-tenant DB scan + leaks a config oracle (204 vs 401) | Indexed lowercase `resource` lookup; uniform response. |
| 8 | **Medium** | No security headers anywhere (CSP/HSTS/X-Frame-Options/Referrer-Policy) | Add `headers()` in `next.config.ts`. |
| 9 | **Other dep** | 22 further advisories (next DoS, sharp/libvips, postcss, brace-expansion) | `pnpm update` to patched ranges; wire `pnpm audit` into CI. |

Full rotation checklist and file:line evidence live in the audit working notes; the items
above are the ones scheduled into M-C.

---

## 3. The reporting spine — one flow, four rungs

Everything in this plan serves a single through-line that carries a project from ideation
to market rollout and pushes truth upward without anyone retyping it:

```
 TASK SIGNAL        member's board — tasks synced from YouTrack (pull-only),
   │                moved through To do / Doing / Done; QA owns "Completed"
   ▼
MEMBER REPORT      Friday auto-draft from the board → member edits → submits
   │                to their PM(s).                          [built ✓]
   ▼
PM CHECK-IN        PM acknowledges member reports → confirms the project check-in
   │                (computed RAG + narrative, <2 min).      [built ✓]
   ▼
HEAD-OF-PMS        NEW: PM check-ins roll up into a portfolio/programme report the
ROLL-UP             Head of Projects reviews, annotates, and approves.  [§6 — the gap]
   │
   ▼
EXECUTIVE          Portfolio dashboard (pipeline + rollout heatmap), status reports
                    (R1/R2/R3), and resource/capacity view.  [built ✓, needs finishing]
```

Three of the four rungs already exist and are tested. The revamp's job is to **connect
them into one visible, turned-on pipeline** and **build the third rung**. Ideation →
rollout is covered by the existing pipeline stages (`Exploring → Evaluating → Approved`)
and per-type delivery checkpoints (BRD→…→Go-Live for product build; Business Case→…→
Rollout for market rollout) from `docs/18` — those are built; this plan surfaces them.

---

## 4. M-C — Cleanup & hardening (do this first)

Cutting and fixing creates the room to revamp cleanly. This milestone changes no product
behaviour except turning on what's already built and closing security gaps.

**Security (from §2.2):** upgrade `next-auth`/`@auth/core` (finding 1); fix the
`mustChangePassword` bypass (2); regenerate `rls.sql` + add the coverage test (4); add
security headers (8); add authenticated-route rate limiting (6); `pnpm update` for the
dependency advisories (9) and wire `pnpm audit` + `gitleaks` into `.github/workflows/ci.yml`.

**Dead code:** delete `src/server/nav.ts`, the ten orphaned components, and fossil types;
drop the abandoned ClickUp schema block (`schema.prisma` ~1084–1573, keep `TimeEntry`
until it retargets `ProjectTask`) with one migration; remove the stale
`.claude/worktrees/*` and dead local branches so nobody greps the wrong tree again.

**Doc/dependency truth:** prune `@anthropic-ai/sdk`, `@auth/prisma-adapter`, `recharts`
from `package.json`; decide TanStack Query (adopt or drop) — and **update `CLAUDE.md` +
`docs/03` to match reality**. Mark `docs/10` superseded; annotate `docs/15` 6.3–6.5 as
shipped; flip `docs/16` status to "Executed."

**Turn on what's built (behind confirmation, per module):** stage the three dark flags
(`FEATURE_YOUTRACK`, `FEATURE_EMAIL`, `FEATURE_COMMIT_AUTOMATION`) for enablement in the
milestones that own them (M1, M4, M5) rather than all at once — but confirm now which are
already live on the box, because some of the "missing" features may simply be off.

**Definition of done:** `pnpm lint && typecheck && test` green; RLS coverage test passes;
CI runs `pnpm audit`; no dead ClickUp references; docs match code.

---

## 5. Module-by-module revamp

Each module below states: what exists, the verdict, and the concrete revamp work. Ordered
along your ideation → rollout flow.

### 5.1 Onboarding & access

*Exists:* invite flow with tenant role + user group(s) + primary group, live "will land
on" preview, first-login checklist per persona, TOTP MFA, request-access intake.
*Verdict:* keep + fix. *Revamp:* fix the password-reset bypass (§2.2 #2); add MFA recovery
codes + admin reset (an unrecoverable authenticator is a support burden); make the invite
→ first-login → land-on-your-dashboard path a deliberate, tested happy path so a new
dev/QA/implementor is productive on day one with zero memberships.

### 5.2 Delivery sync from YouTrack (dev / QA / implementor tasks)

*Exists:* mature **pull-only** connector (`src/server/connectors/youtrack.ts` +
`youtrack-sync.ts`), idempotent upsert mirroring YouTrack issues onto `ProjectTask` (no
parallel table), per-project field-map editor, manual pull route, a polling job — all
behind `FEATURE_YOUTRACK` (OFF). *Verdict:* keep + turn on + harden. *Revamp:* enable the
flag for Riverbank; put the sync job on the cron dispatcher on a sensible cadence
(e.g. every 15 min) with a visible "last synced / last error" state in the integrations
grid; add **timeout + retry-with-backoff** to the YouTrack fetch (the one resilience gap —
today a hung endpoint stalls the job); confirm the assignee-by-email match and the To
do/Doing/Done lane mapping (`NotStarted` / `InProgress|InReview|InQA` / `Completed`) so a
synced issue lands correctly on the right person's board with QA owning `Completed`. This
is the rung that feeds everything upstream — it goes early.

### 5.3 Personal boards (the daily surface)

*Exists:* `/board` per-user board, role-scoped lenses (PM sees all, disciplines see their
lane), project grouping, assign-and-notify, reporter notifications on status change.
*Verdict:* keep. *Revamp:* light — a keyboard-first pass and the swimlanes deferred in
DM1.19; confirm the Done lane cleanly feeds the Friday member draft (§5.4). No structural
change.

### 5.4 Report generation, editing & routing to the PM

*Exists:* Friday auto-draft from the member's board → mandatory edit step in the composer
→ submit → PM acknowledge → rolls into the project check-in
(`src/server/member-reports.ts`, `checkins.ts`, `jobs/friday.ts`). The human-in-the-loop
invariant (never auto-send) is enforced in code. *Verdict:* keep (best-designed area).
*Revamp:* fix the share-link lifecycle (§2.2 #5) since reports are shared by token; add
the reporting depth that's cheap — CSV/XLSX export on every report table; confirm the R1
(pipeline status), R2 (project × market matrix), R3 (market focus & blockers) views from
`docs/18` render for Riverbank. Server-side PDF stays scheduled for the exports milestone.

### 5.5 PM → Head of PMs roll-up — **the missing rung** (see §6)

*Exists:* the Head-of-Projects role, the exec digest, portfolio snapshots. *Verdict:*
**build.** This is the one genuinely new module. Detailed in §6.

### 5.6 Executive portfolio view — status & resources

*Exists:* exec dashboard v3 grouped by portfolio (pipeline table for `Pipeline`
portfolios, project × market rollout heatmap for `Rollout`), decision queue, capacity view
(`/people`), snapshots for WoW deltas. *Verdict:* keep + finish. *Revamp:* ensure the
Head-of-PMs approved roll-up (§6) is what surfaces on the exec view (so execs read
*confirmed* truth, with an honest "unconfirmed — computed shown" marker where a rung is
missing); finish the resource/capacity picture with leave-awareness (Absence model exists);
verify the health-parity test still holds (dashboard RAG === Q RAG === report RAG).

---

## 6. New build — the Head of PMs roll-up layer

This is the rung you named that doesn't exist yet: *"how project manager sends reports to
head of PMs, and how executives see the overall projects."* Today PM check-ins feed the
exec digest directly; there is no review-and-approve step where the Head of Projects
consolidates across PMs before it reaches the executive.

**The model.** Add a `PortfolioReport` (or `ProgrammeReport`) entity: tenant-scoped, keyed
by portfolio + isoWeek, states `Draft → Submitted → Approved`, RLS + isolation test,
audited, emits a `DomainEvent`. It is composed — not retyped — from the confirmed project
check-ins in that portfolio for the week (RAG roll-up via the one health engine, list of
projects with status, open escalations, capacity exposure, unconfirmed projects flagged).

**The flow.**
1. Friday: once PM check-ins are confirmed, the system **drafts** the portfolio roll-up
   for each portfolio's Head of Projects (same "computed, narrated, confirmed" pattern as
   the PM check-in — the pattern already exists, this reuses it one level up).
2. The Head of Projects reviews the draft on a new **Head dashboard lens**: every project
   across their portfolios, which check-ins are unconfirmed, which projects are red, the
   escalations awaiting a decision. They edit the narrative, resolve/annotate escalations,
   and **approve**.
3. The approved `PortfolioReport` is what flows to the executive view and the exec digest.
   Where a PM hasn't confirmed, it surfaces honestly as "unconfirmed — computed status
   shown," never silently.

**Head-of-PMs dashboard.** The heads already land on the executive preset; add the
"delivery lens" (foreshadowed in `docs/17` §1.2) that swaps in: the cross-PM roll-up
review queue, per-PM confirmation status, and the approve action. This is composition on
the existing shell — not a new page.

**Why build it this way:** it reuses the exact draft→confirm machinery that makes the PM
check-in a 2-minute task, extends the snapshot/roll-up engine already computing portfolio
health, and slots into the persona/preset system. It is the highest-value new work in the
plan and the reason the chain currently feels incomplete.

---

## 7. Operational hardening (makes "well-built" feel "stable")

The audit's top NFR gaps are all operational, and they're why a sound app feels shaky.
Scheduled as a dedicated milestone because they protect the only real tenant's data.

**Backups (P0 in practice):** the production stack keeps everything in one Docker volume
on one box with no dump schedule, offsite copy, or tested restore. Add a `pg_dump` cron
with offsite copy and a documented, *tested* restore. This is the single most important
operational fix.

**Health & monitoring:** add a real `/health` (and `/ready`) endpoint and a Docker
`HEALTHCHECK`; the deploy script currently verifies by curling `/login`. Add structured
logging (there is exactly one log line in all of `src/`) with correlation IDs, and basic
error tracking so an outage isn't discovered only when a user reports it.

**Resilience:** add timeout + retry/backoff to the external calls that lack them (YouTrack
sync, GitHub summary, Graph mail) — the LLM client already has a 90s abort; the others
don't.

**Deploy/rollback:** move from rsync-and-build-on-box to tagged images so a rollback is
possible in minutes; connect CI to deploy so untested local changes can't ship.

---

## 8. Data model changes (summary)

| Model | Change | Milestone |
|---|---|---|
| `rls.sql` | regenerate to include all 15 missing tenant tables; add coverage test | M-C |
| ClickUp models (Space…AutomationRun) | **drop** (keep `TimeEntry`) | M-C |
| `SharedReport` | add `expiresAt`, `revokedAt`; revoke route; access-audit | M-C / M4 |
| `PortfolioReport` (portfolio, isoWeek, Draft/Submitted/Approved, narrative, roll-up RAG) | **new** — the Head-of-PMs rung | M3 |
| `User` MFA recovery codes | new (hashed) | M1 |

All new tables: `tenant_id`, RLS policy, isolation test. All migrations follow the DM1.18
tenant-loop pattern. Every mutation and machine actor audited.

---

## 9. Milestone sequence

| # | Milestone | Scope | Size |
|---|---|---|---|
| **M-C** | **Cleanup & hardening** | §2.2 security fixes, dep upgrades, dead-code + ClickUp-schema removal, doc/dependency truth-up, `rls.sql` regen + test, CI `pnpm audit`/`gitleaks` | L |
| **M0-op** | **Operational safety net** | §7: pg_dump backups + tested restore, `/health` + Docker healthcheck, structured logging + correlation IDs, external-call timeouts/retry | M |
| **M1** | **Onboarding & delivery sync** | §5.1 onboarding fix + MFA recovery; §5.2 turn on YouTrack, scheduled sync, last-synced/error UI, lane + assignee verification | L |
| **M2** | **Boards & member reporting** | §5.3 board polish + swimlanes; §5.4 confirm Friday draft→edit→submit→PM ack loop end-to-end; share-link lifecycle fix; CSV/XLSX export | M |
| **M3** | **Head of PMs roll-up** | §6: `PortfolioReport` model, Friday draft→review→approve, Head delivery-lens dashboard, honest unconfirmed handling | L |
| **M4** | **Executive view & conversation** | §5.6 finish exec portfolio/status/resources reading *approved* roll-ups; enable email (`FEATURE_EMAIL`) for report delivery + digests; leave-aware capacity | M |
| **M5** | **Delivery depth & exports** | enable `FEATURE_COMMIT_AUTOMATION`; split `project-tasks.ts`; server-side PDF for reports; adopt shared error envelope across routes | M |

**Sequencing logic:** M-C makes the tree honest and safe to work in; M0-op stops the app
*feeling* unstable; M1 lights up the bottom rung (tasks in) and fixes onboarding; M2
confirms the member→PM rung end-to-end and makes reports exportable; M3 builds the missing
Head-of-PMs rung; M4 finishes what the executive sees and turns email on; M5 pays down the
last debt and adds depth. The whole reporting spine (§3) is visible and turned on by end
of M3.

---

## 10. Definition of done (per milestone, extends `CLAUDE.md`)

- Works for Riverbank with correct theming; breaks nothing under the Demo Org B fixture.
- RLS verified — tenant A cannot see tenant B data (test exists for every new query).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` green; new e2e for any new flow.
- New mutations write audit rows; new machine actors (roll-up job) audit.
- No secrets or PII committed; `pnpm audit` clean of criticals/highs.
- Health-parity holds: dashboard RAG === Q RAG === report RAG for 100% of projects.
- No dark feature ships to users without its flag deliberately flipped and confirmed.

---

## 11. Parked (pending business input — do not guess)

Carried from `docs/16` §12: milestone templates per project type, prioritisation scoring
model, CBA/benefits model + typed money (budget chips return only when money is typed),
PPT Exco pack, Oracle Fusion budget pull, native Teams integration. Two-way YouTrack sync
is explicitly out of scope — pull-only is the confirmed direction (2026-08-03).
