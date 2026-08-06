# 36 — Pending checklist (everything not yet done)

**Compiled:** 2026-08-06, after M-P4a + the DM1.67 cleanup.
**Method:** verified against the tree, the box, and the docs — not from memory. Where a
claim came from an inspection, the evidence is named so it can be re-checked.
**Shipped so far:** P1 (create & assign) · dashboards remodel · P2 (deliver) · P3 (report)
· P4a (idea intake). See DECISIONS.md DM1.51–DM1.67.

---

## 1. In flight — P4 "Front of funnel & polish" (docs/35)

- [ ] **M-P4b — ⌘K command search.** One `/api/search` over projects, portfolios,
      programmes, people, ideas + permission-filtered actions; `cmdk` palette. Runs inside
      RLS and existing scoping, so nothing new becomes visible. Adds one dependency
      (note it in docs/03).
- [ ] **M-P4c — Notifications centre + first-run/a11y sweep.** A real `/notifications`
      page with paging and filters (the bell only samples today); honest-empty sweep over
      the pre-P1 surfaces (`/risks`, `/people`, `/subsidiaries`, `/my-tasks`);
      keyboard/focus/touch-target pass over the P1–P4 surfaces.

## 2. Not yet deployed

- [ ] **Ship DM1.67 + M-C to the box.** Both are on `main` and neither is deployed yet.
      M-C carries a DESTRUCTIVE migration (21 DROP TABLEs), so it needs the full
      `./scripts/deploy.sh` — `--no-build` cannot deliver migrations. All 21 tables were
      verified empty in production first.

## 3. P5 — Governance depth & benefits (docs/26 §11) — no execution spec yet

- [ ] **Write the P5 execution spec** (the docs/27/33/34/35 pattern) before building.
- [ ] **Decisions & lessons at closure** — a closure gate that *requires* lessons; promote
      a comment thread's outcome to a `Decision`. Both models exist; the gate does not.
- [ ] **Retention / GDPR** — retention windows, export-my-data, delete-my-data. Nothing
      exists today; this is the one P5 item with a regulatory driver, so it should lead.
- [ ] **Audit viewer** — `audit_log` is written on every mutation but there is no UI to
      read it beyond `/admin/audit`; confirm what that page covers before specifying more.
- [ ] **Benefits realisation** — blocked: needs typed money (see §5).

## 4. P0 foundations that were never finished (docs/26 §11 P0)

P0 promised "nothing user-facing feels different; everything gets trustworthy." These are
the parts still missing — worth doing before more features, since they are what makes an
incident survivable:

- [x] ~~No database backup~~ — **DONE 2026-08-06 (M-P0a, DM1.69).** `scripts/backup-db.sh`
      on cron: nightly 02:30 UTC, Sundays with `--verify` (restores into a scratch database
      and compares tables + key row counts + RLS policy counts, then drops it). 14-day
      retention, dumps 0600 in a 0700 dir outside the app tree. First verified run:
      tables 61→61, key rows 142→142, policies 57→57.
- [x] ~~No health endpoint~~ — **DONE 2026-08-06 (M-P0a).** `/api/health` runs a real
      query; `deploy.sh` now gates on it, so a live app over a dead database fails the
      deploy.
- [ ] **No observability** beyond `docker compose logs`. No error tracking. `/api/health`
      now exists, so pointing any uptime monitor at `https://q.fikrawork.com/api/health` is
      the cheap next step — it returns 503 when the database is unreachable.
- [ ] **Backups are on-box only.** The dumps live on the same machine as the database, so
      they survive a bad migration or an accidental delete but NOT a dead disk. Copying them
      off-box (or snapshotting the volume) is the remaining half of a real backup story.

## 5. Deferred features with an explicit promise attached

Each of these is *stated on a live surface* or in a spec, so the promise is public:

- [ ] **M9-B — server-rendered PDF exports.** The reports index literally says "PDF export
      lands with M9-B; CSV is what ships today" (roll-ups tab). Also owed: XLSX/CSV on
      every table, the Head's portfolio pack, resource-allocation export.
- [ ] **Budget, typed in Phase C.** The workspace shows `Budget: typed in Phase C`. Until
      then benefits realisation and business-case scoring stay parked.
- [ ] **Business-case scoring / prioritisation** (docs/26 §2 Evaluating stage) — parked on
      typed money.
- [ ] **Q idea summaries** (docs/35 §3). The `Idea.summary` column exists and stays null;
      the card renders nothing rather than a fabricated line. Shipping it needs the
      scope+timestamp honesty contract (docs/26 §10) — a Q milestone, not a bolt-on.
- [ ] **Public (unauthenticated) idea submission** — deliberately narrowed in M-P4a; the
      wireframe's "public-ish" form stays inside the tenant until there's a reason to widen.

## 6. Security & correctness follow-ups

- [ ] **`budget:read` is enforced nowhere.** Granted by role in `rbac.ts`, but the only
      consumer was dead code (removed in DM1.67); `src/server/projects.ts` returns `budget`
      to any viewer who can read the project. Harmless today (placeholder is empty) but
      **must land before Phase C stores real figures**. A note sits at the deletion site in
      `src/lib/access.ts`; spun out as its own task.
- [ ] **Confirm risk/blocker owner-writes-own is intended to be gone.** DM1.67 removed the
      unused `canWriteRiskOrBlocker`, which had allowed an item's *owner* to write their own
      risk/blocker. The live route (`src/app/api/risks/route.ts`) uses project membership or
      `risk:write` instead — **more** restrictive, so no exposure, but if owner-writes-own
      was the intent then it was never wired and should be.

## 7. Code health (docs/19 M5 + observations)

- [ ] **Time capture no longer exists** — `TimeEntry` and `/time` were removed with the
      ClickUp schema (M-C): the model hung off the dead `task` table by a required FK, had
      no capture path and 0 rows, so the page could only render an empty table. docs/19 M6
      owns rebuilding time capture against `ProjectTask` **if** it is still wanted; decide
      that before anyone asks where Time went.

- [ ] **Split `src/server/project-tasks.ts`** — 846 lines, the largest file in the tree.
- [ ] **Adopt the shared error envelope across all routes** (docs/19 M5); it exists but
      route handlers still hand-roll some responses.
- [ ] **e2e coverage is one 74-line smoke spec.** The unit/RLS suite is strong (821 tests)
      but the browser path is barely covered — the new wizards, triage board and reports
      index have no e2e.
- [ ] **`(app)/projects/new/project-wizard.tsx` is 707 lines** — the next biggest UI file;
      step components could be extracted if it grows again.

## 8. Ops / environment — blocked on credentials or a decision from Joyce

Verified on the box: **no `FEATURE_*` variables are set at all** in `.env.production`
(only `AUTH_URL` and `AUTH_TRUST_HOST`). So every flagged capability is off in production:

- [ ] **`FEATURE_EMAIL` + `GRAPH_*` credentials** → until set, no invite emails, no Friday
      digests, no report delivery (docs/19 M4). **Needs Joyce's Azure app credentials.**
- [ ] **`FEATURE_YOUTRACK`** → the read-only board renders, but no sync runs in production;
      "last synced" will read empty. Needs the YouTrack base URL + token per project.
- [ ] **`FEATURE_COMMIT_AUTOMATION`** (docs/19 M5) → GitHub commit→task automation stays off.
- [x] ~~Decide whether `FEATURE_SPACES` should exist~~ — **answered 2026-08-06: nothing
      from ClickUp stays.** The flag, the 21 ClickUp-era tables and the `/time` surface that
      hung off them are gone (M-C, DM1.68). Nothing to set on the box.

---

## Suggested order

1. **Backups + health endpoint** (§4) — small, and the only items whose absence can lose data.
2. **M-P4b, M-P4c** (§1) — finish the phase in flight.
3. **Ship the cleanup** (§2) — free, do it with the next deploy.
4. **`budget:read`** (§6) — before any Phase C work starts.
5. **P5 spec** (§3), leading with retention/GDPR.
6. **Ops flags** (§8) — as Joyce's credentials arrive; independent of the above.

M9-B exports (§5) can slot in wherever the PDF promise starts costing credibility.
