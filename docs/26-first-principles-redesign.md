# 26 — QUBIT, Designed from First Principles

**Status:** Vision / blueprint · 2026-08-03
**Owner:** Joyce Okore
**Reads on top of:** `docs/17/18/19/24/25` (they still hold; this reframes the whole)
**Purpose:** step back from patching and design the product as one coherent system —
onboarding, assignment, the creation wizards, and everything the earlier passes skipped —
then say how to get there without a big-bang rewrite.

---

## 1. What QUBIT is (one sentence, then the loops)

**QUBIT is the single system of record for how Riverbank turns an idea into a product live
in its markets — and the truth engine that tells leadership what's healthy and what needs a
decision.** It is opinionated, not infinitely configurable. Everything in it serves one of
four loops:

- **Ideation loop** — a business idea enters, is triaged, and either becomes a governed
  project or is parked with a reason. *(New — today the funnel starts too late, at a
  half-created project.)*
- **Daily loop** — a person opens QUBIT and knows the one thing to do next; tasks are the
  raw signal, mirrored read-only from YouTrack.
- **Weekly loop** — a member confirms a system-drafted update in two minutes; it flows
  member → PM → Head of PMs → executive without anyone chasing.
- **Lifecycle loop** — a project moves through governed stages and delivery checkpoints,
  gate by gate, with documents, decisions and lessons captured as it goes.

If a feature doesn't serve a loop, it doesn't ship.

## 2. The lifecycle spine (ideation → benefits)

Every screen hangs off this spine. Each stage has an owner, an entry gate, and the QUBIT
surface that runs it.

| Stage | Question it answers | Gate to enter | QUBIT surface |
|---|---|---|---|
| **Intake** | Is this idea worth exploring? | Idea submitted + sponsor named | Idea intake + triage board *(new)* |
| **Exploring** | What would it take? | Triage accepted | Project (stage=Exploring), draft BRD |
| **Evaluating** | Is the business case sound? | BRD in register + rough sizing | Business case + prioritisation score *(new/parked)* |
| **Approved** | Build it — how far are we? | Approval decision logged | Delivery workspace: board + checkpoints |
| **Rollout** | Where is it live across markets? | Go-Live checkpoint per market | Market rollout tracks + heat map |
| **Benefits** | Did it pay off? | PIR done, baseline exists | Benefits realisation *(parked till money is typed)* |
| **Paused/Shelved** | Why did it stop? | Reason + decision logged | Same, with a paused/shelved badge |

Pipeline categories the business uses (`docs/24`): **Approved · Exploring · Shelved**.
Delivery status (Prototype → SIT → UAT → Go-Live) is a *separate* axis, derived from
checkpoints. Both are shown; neither is typed twice.

## 3. Information architecture (the spine made navigable)

```
Tenant (Riverbank)
 └─ Portfolio        (viewKind: Pipeline | Rollout)   — Approved/Exploring/Shelved
     └─ Programme    (optional grouping)
         └─ Project / module
             ├─ Delivery: pipeline stage + checkpoint template (BRD→Go-Live)
             ├─ Board:    tasks mirrored read-only from YouTrack (one board)
             ├─ Market tracks: per subsidiary (KE TZ UG RW BI SS DRC) + market check-in
             ├─ People:   members with a role hat + allocation % + dates (leave-aware)
             ├─ Documents, RAID, Requirements, Decisions, Lessons
             └─ Reports:  member update → PM report → Head roll-up → exec summary
```

Navigation is the six items from the notes (Dashboard · Portfolio · Programme · Projects ·
Reports · Teams & People), composed per role (never forked — `docs/25 §2`). Add two
cross-cutting affordances that are missing today and pay for themselves immediately:

- **Command palette / global search** (⌘K): jump to any project, person, document, or
  report; run "generate report", "assign me to…", "new project". The fastest nav in a
  dense app is typing.
- **Notification centre** (SSE-live bell + digest-first email): one place for @mentions,
  assignments, nudges, approvals, with a per-user channel matrix and a one-click "too
  noisy" downgrade.

## 4. Onboarding — three layers, each a first-class flow

Today only user-invite exists. Design all three.

### 4.1 Organisation setup (one-time, guided)
A Super-Admin "Set up QUBIT" wizard so a tenant is usable in ten minutes, not by hand-run
scripts: **brand** (colour, logo) → **markets & departments** (seed the KCB markets as
`OrgUnit.kind=Market`, internal departments as `Internal`) → **checkpoint templates**
(ship "Product build" + "Market rollout", editable) → **import people** (CSV → invites) →
**first portfolio**. Everything has sane defaults; every step is skippable and resumable.

### 4.2 User onboarding (invite → guided first-login)
Already specced and building: token email invite (`docs/22`), guided password → MFA →
confirm-role → land (`docs/23`), with the security fixes (`docs/20`). Keep. Add one thing
often missed: a **role-and-scope preview** on the invite ("Will land on the PM dashboard;
can manage projects they lead") so admins invite deliberately.

### 4.3 Assignment & staffing — the missing middle
"Assigning" is the weakest link today (a single optional project field at invite). Make it
a real capability, because staffing *is* delivery:

- **Assign to a project** = person + **role hat** (drives board lens, QA scope, report
  routing) + **allocation %** + **start/end dates**. Not a bare membership row.
- **Capacity-aware**: the assign panel shows each candidate's current load and **leave**
  (from `Absence`), warns on over-allocation and on assigning into a leave window, and
  suggests alternates (same role, lowest utilisation).
- **Resource requests**: a PM requests "1 QA, 60%, Aug–Sep"; the Head/resource owner fills
  it from a capacity view. Turns staffing from side-channel Teams chats into a tracked flow.
- **Team templates**: a project type pre-suggests its team shape (PM, Tech Lead, 2 Devs,
  QA, Implementor) so a new project is staffed in one click, then adjusted.
- **Bulk assign**: add several people to a project, or one person to several, at once.

## 5. The creation wizards (the explicit ask)

One shared wizard chrome: **left rail of steps, smart defaults, inline validation, draft
auto-save, a final Review, and "create another"**. Nothing is a wall of fields; each step
answers one question. All three below share it.

### 5.1 Portfolio wizard
1. **Identity** — name, owner, category (Approved/Exploring/Shelved).
2. **Lens** — Pipeline (stage-grouped) or Rollout (project × market heat map). This one
   choice sets the portfolio's default view and whether the market map shows.
3. **Markets** *(Rollout only)* — which subsidiaries this portfolio rolls out to.
4. **Governance** — who may edit stage/priority (defaults from roles), report recipients.
5. **Review** → create. Empty portfolio lands on a "add your first programme/project" state.

### 5.2 Programme wizard (light)
Name · parent portfolio · owner · category. Exists to group projects; inherits the
portfolio's markets and recipients unless overridden.

### 5.3 Project wizard (the centrepiece)
1. **Basics** — name, code (auto-suggested), portfolio (**required**), programme (optional).
2. **Type & delivery** — project type → **checkpoint template** (Product build BRD→Go-Live,
   or Market rollout); this decides the Delivery tab's gates. Pipeline stage defaults to
   Exploring.
3. **Markets** — which subsidiaries it targets (pre-filled from portfolio, editable).
4. **Team** — apply a team template or pick people; each gets a role hat + allocation +
   dates, with the capacity/leave checks from §4.3.
5. **Documents & requirements** — optionally attach a BRD/URS now; offer **Q ingest** →
   candidate requirements/milestones/tasks for human approval (never auto-applied).
6. **Integration** — link the **YouTrack project** (so the board populates) and repo
   (optional, for commit automation); both flag-gated, both skippable.
7. **Review** → create. Draft-save throughout, so a half-planned project isn't lost.

### 5.4 Idea intake → project (front of the funnel — new)
A short public-ish form (name, sponsor, problem, expected value) → a **triage board** the
Head/PMO works: accept (spawns a project in Exploring, pre-filled) · park (with reason) ·
merge (into an existing project). Q can pre-summarise and suggest a portfolio. This is the
piece that makes QUBIT own the *whole* journey rather than starting mid-stream.

## 6. Delivery & governance (make the middle trustworthy)

- **One read-only board per project** from YouTrack (`docs/25 §4`); surface **sync health**
  (last synced, errors) so a stale board is never mistaken for a quiet one.
- **Checkpoints**: PM sets gate states; **% is derived**, never typed; gate entry can
  soft-block with an audited override + reason.
- **Cross-project dependencies** *(missing today)*: "Project A's UAT waits on B's API." A
  simple dependency link + a portfolio-level "what's blocking what" view prevents the most
  expensive surprises. Cycle-checked at write time (the pattern already exists for tasks).
- **Decisions & lessons**: a comment thread's outcome promotes to a `Decision`; closure
  requires **lessons learned**. This fills the "D" in RAID and stops decisions dying in
  Teams threads.
- **Documents as a register** (versions + approval workflow), not a folder.

## 7. Reporting & insight (the spine, finished)

The member → PM → **Head of PMs** → executive chain (`docs/25 §5`), authored **in the
workspace**, computed-then-confirmed, honest about unconfirmed items. Add the pieces that
make it effective:

- **The Head-of-PMs roll-up** (`PortfolioReport`) — the one genuinely missing rung; review
  + approve before it reaches the exec.
- **Subscriptions & digests** — Friday push to leads/execs; per-user preferences; nobody
  asks "what's the status?" on a Friday.
- **Exports everywhere** — CSV/XLSX on every table; server-side **PDF** for reports; a
  Head-of-PMs **portfolio pack** and **resource-allocation** export.
- **One health engine** — dashboard RAG === Q RAG === report RAG, parity-tested. Trust is
  the only currency the exec view has.

## 8. Cross-cutting foundations that were missed

These are not features; they're why a good app feels solid. Most are cheap and were skipped.

| Area | What's missing | Why it matters |
|---|---|---|
| Search / ⌘K | No global search or command palette | The single biggest speed win in a dense PPM app |
| Notifications | Polling bell; email dark | In-app must be live (SSE); email digest-first, opt-out per type |
| Permissions clarity | Coarse legacy keys; no visible matrix | Admins can't see who can do what; finish the fine-grained migration |
| Empty & first-run states | Sparse | New tenants/projects look broken; add guidance + sample content |
| Mobile / responsive | Desktop-first | Execs read on phones; the dashboard + reports must work small |
| Accessibility | Partial | WCAG AA on pills/heatmap (never colour-only), keyboard-first board |
| Performance | Unpaginated lists, little caching | Grows into slowness; paginate + cache reads |
| Degradation | Hard dependency on YouTrack/ERP/mail | Show "sync stale / offline", never a blank or a lie |
| Observability + backups | None; single Docker volume | An outage is invisible; data loss is unbounded — fix before scale |
| Retention / GDPR | No export/delete/retention | A second real tenant makes this a legal requirement |
| i18n / currency | KES-only, English-only | Markets span 7 countries; budgets will be multi-currency |
| Bulk & templates | One-at-a-time everything | Templates (project/team/report/checklist) + bulk ops save real time |
| Audit surfacing | Strong log, thin viewer | Governance needs a readable, filterable audit trail |

## 9. Where AI (Q) genuinely helps

Only where it's real, gated, and logged — never a deterministic string wearing an "AI"
badge. Good uses: **idea triage** summaries, **BRD/URS ingest → candidate requirements**
(human-approved), **report drafting** from real data, the **exec brief + anomaly flags**
("Mobile Banking is running behind"), and **staffing suggestions**. Every Q output carries
its data scope + generated-at time; mock mode is labelled.

## 10. What changes vs today (the honest delta)

Keep (they're right): multitenant RLS, the health engine, snapshots, the nudger, RAID,
documents/requirements, absence/capacity, the composed-persona dashboards, audit.

Add or finish: idea intake + triage; org-setup wizard; real assignment/capacity flow +
resource requests; the three creation wizards; read-only YouTrack board; Head-of-PMs
roll-up; cross-project dependencies; search/⌘K; live notifications + digests; server PDF +
portfolio/resource exports; the cross-cutting foundations in §8.

Retire: the standalone reports centre (authoring moves into workspaces, `docs/25 §6`); the
dead ClickUp schema; any in-QUBIT task authoring.

## 11. How to get there without a rewrite (sequencing)

Ship in thin, shippable slices; each is a stop-for-review milestone. This *extends* the
milestone tracks already in flight (onboarding M-O1..O4 are building).

1. **P0 — Foundations & safety:** cleanup + security fixes (`docs/19 M-C`), backups,
   health endpoint, observability. Nothing user-facing feels different; everything gets
   trustworthy.
2. **P1 — Create & assign:** the three wizards (§5.1–5.3) + the assignment/capacity flow
   (§4.3) + org-setup wizard (§4.1). This is the "onboarding a portfolio/project" ask.
3. **P2 — Deliver:** read-only YouTrack board + sync health; checkpoints & market tracks;
   cross-project dependencies.
4. **P3 — Report:** member→PM→Head roll-up spine finished; in-workspace authoring;
   subscriptions/digests; exports (PDF + portfolio/resource packs).
5. **P4 — Front of funnel & polish:** idea intake + triage; ⌘K search; live notifications;
   empty/first-run states; mobile + a11y pass.
6. **P5 — Governance depth & benefits:** decisions/lessons at closure; benefits realisation
   once money is typed; retention/GDPR; audit viewer.

Each phase leaves QUBIT fully working — no stage depends on a later one to be usable.

## 12. Success metrics (how we know it's better)

- **Time-to-value:** a new project is created, staffed and YouTrack-linked in one wizard
  session (< 10 min); a new tenant is set up without running a script.
- **Weekly loop:** ≥90% of member updates and PM reports confirmed by Monday 10:00; zero
  ad-hoc "what's the status?" asks.
- **Trust:** dashboard RAG === Q RAG === report RAG for 100% of projects; zero "soon"/
  fake-AI surfaces; every Q output shows scope + timestamp.
- **Awareness:** zero nudges to people on leave; zero tasks assigned into a leave window
  without a warning; sync-stale never shown as healthy.
- **Adoption:** ⌘K used by most active users weekly; median task staleness < 3 days.
- **Safety:** nightly backup with a tested restore; CI green on every merge; no PII/secrets
  in logs.

---

### Next steps (choose)
1. Turn the **portfolio + project + assignment wizards** (§4.3, §5) into interactive
   wireframes in `docs/wireframes/` (extends the existing file).
2. Break this blueprint into **execution-ready milestone specs** (like `docs/21–23`) for
   Claude Code, starting with P1 (create & assign).
3. Both, in that order.
