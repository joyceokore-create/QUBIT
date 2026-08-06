// QUBIT seed data. See docs/05-data-model.md.
// Riverbank Group is the only real tenant (M10, DM1.46). "Demo Org B" is a synthetic
// fixture tenant — the old demo dataset with all customer identity removed — kept so the
// RLS isolation and persona suites always have a fully-shaped tenant B. No real PII —
// synthetic emails are @example.invalid and synthetic names are fictional.

import { prisma } from "../src/lib/db";
import { withTenant } from "../src/lib/tenant";
import { hashPassword } from "../src/lib/password";
import { portfolioHealth } from "../src/server/health";

// LOCAL DEV / DEMO ONLY — every seeded user shares this password so any of them can be
// used to test role-based views. Never reused for real accounts or non-local environments.
const DEMO_PASSWORD = "Passw0rd!23";

const STATUS_MAP: Record<string, string> = {
  "On Track": "OnTrack",
  "At Risk": "AtRisk",
  Overdue: "Overdue",
  Planning: "Planning",
};
function mapStatus(label: string): string {
  return STATUS_MAP[label] ?? label;
}

// docs/18 §1 — legacy seed priorities → the business enum (matches the M18-A migration).
const PRIORITY_MAP: Record<string, string> = { Medium: "Med", Critical: "High" };
function mapPriority(label: string): string {
  return PRIORITY_MAP[label] ?? label;
}

/** Deterministic demo grouping across the four pipeline stages (docs/18 §1). */
function mapPipelineStage(status: string, index: number): string {
  if (status === "Cancelled") return "Paused";
  if (status === "Planning") return index % 2 === 0 ? "Exploring" : "Evaluating";
  return "Approved";
}

function daysAgoToDate(daysAgo?: number): Date | undefined {
  return daysAgo === undefined ? undefined : new Date(Date.now() - daysAgo * 86_400_000);
}

interface OrgUnitSeed {
  code: string;
  name: string;
  flag?: string;
  /** docs/18 §3.1 — Internal = a subsidiary of this tenant (drives the Subsidiaries nav);
   *  Market = a rollout geography a portfolio ships into. Defaults to Internal. */
  kind?: "Internal" | "Market";
}
interface UserSeed {
  email: string;
  name: string;
  roles: string[];
  // Flat department placement (DM1.1) — resolved to Department.id after departments seed.
  departmentName?: string;
}
interface DepartmentSeed {
  name: string;
  // Department head (informational + drives the departments:manage scope). Resolved by email.
  headUserEmail?: string;
}
interface PortfolioSeed {
  key: string;
  name: string;
  description: string;
  budget: string;
  /** docs/18 §3.0 — Pipeline (stage-grouped table) or Rollout (project × market heatmap). */
  viewKind?: "Pipeline" | "Rollout";
}
interface ProgrammeSeed {
  key: string;
  portfolioKey: string;
  name: string;
  description: string;
  status: string;
  budget: string;
}
interface SubStatusSeed {
  pct: number;
  status: string;
  ms: string[];
  msSt: string[];
  // Sparse, index-aligned with ms/msSt — most milestones have no date. Only a handful are
  // backfilled for a realistic "Upcoming Milestones" feed (Milestone 4).
  msDue?: (string | null)[];
}
interface ProjectSeed {
  code: string;
  name: string;
  description?: string;
  type: "Project" | "Programme";
  portfolioKey: string | null;
  programmeKey: string | null;
  priority: string;
  status: string;
  /** docs/18 §7 — optional one-line status/comment for demo rows. */
  statusNote?: string;
  due: string | null;
  budget: string | null;
  // Free-text role placeholders only (e.g. "Project Lead, Contributor") — never real names.
  team?: string;
  subs: Record<string, SubStatusSeed>;
}
interface RiskSeed {
  title: string;
  projectCode: string | null;
  category: string;
  probability: number;
  impact: number;
  mitigation: string;
  ownerEmail: string;
  status: string;
  // Backdates createdAt so the escalations feed shows a realistic "N days ago" instead of
  // everything reading "just now" right after a fresh seed (Milestone 4).
  daysAgo?: number;
}
interface IssueSeed {
  title: string;
  projectCode: string | null;
  severity: string;
  ownerEmail: string;
  status: string;
  originRiskTitle?: string;
  daysAgo?: number;
}
interface TenantSeed {
  slug: string;
  name: string;
  brandColor: string;
  brandLight: string;
  domains: string[];
  orgUnits: OrgUnitSeed[];
  users: UserSeed[];
  departments?: DepartmentSeed[];
  portfolios: PortfolioSeed[];
  programmes: ProgrammeSeed[];
  projects: ProjectSeed[];
  risks: RiskSeed[];
  issues: IssueSeed[];
}

// ── Demo Org B — SYNTHETIC fixture tenant (M10, DM1.46) ─────────────────────
//
// Riverbank is the only real tenant. This dataset (formerly branded as the KCB demo)
// stays because the RLS isolation suites and persona/e2e fixtures depend on its SHAPE —
// portfolios, programmes, markets, checkpoint templates, demo QA/Implementor users. All
// customer identity is gone: the tenant, its people and its org units are unmistakably
// fake, on .invalid domains.

const DEMO_B_SEED: TenantSeed = {
  slug: "demo-b",
  name: "Demo Org B",
  brandColor: "#475569",
  brandLight: "#E2E8F0",
  domains: ["demo-b.example.invalid"],
  orgUnits: [
    { code: "KE", name: "Demo Kenya", flag: "🇰🇪" },
    { code: "UG", name: "Demo Uganda", flag: "🇺🇬" },
    { code: "TZ", name: "Demo Tanzania", flag: "🇹🇿" },
    { code: "RW", name: "Demo Rwanda", flag: "🇷🇼" },
    { code: "SS", name: "Demo South Sudan", flag: "🇸🇸" },
  ],
  // Only the tenant's super-admin is seeded — every other user is onboarded in-app.
  users: [
    { email: "demo.admin@demo-b.example.invalid", name: "Demo Admin B", roles: ["PlatformSuperAdmin"] },
  ],
  portfolios: [
    {
      key: "p1",
      name: "Digital Transformation",
      description:
        "Group-wide digital banking modernisation and platform uplift across all subsidiaries.",
      budget: "KES 2.8B",
    },
    {
      key: "p2",
      name: "Risk & Compliance",
      description: "Regulatory, AML, KYC, cybersecurity and ESG reporting programmes.",
      budget: "KES 1.5B",
    },
    {
      key: "p3",
      name: "Infrastructure",
      description:
        "Core technology infrastructure — data centres, Oracle systems, ATM networks, HR platforms.",
      budget: "KES 1.6B",
    },
    {
      key: "p4",
      name: "Customer Experience",
      description:
        "Digital lending, agency banking and CRM platforms to improve customer outcomes.",
      budget: "KES 830M",
    },
  ],
  programmes: [
    {
      key: "prog1",
      portfolioKey: "p1",
      name: "Next-Gen Core Banking Programme",
      description: "Full core banking system replacement across the group",
      status: "At Risk",
      budget: "KES 1.8B",
    },
    {
      key: "prog2",
      portfolioKey: "p1",
      name: "Digital Channels Programme",
      description: "Mobile, internet banking and open API platforms",
      status: "On Track",
      budget: "KES 980M",
    },
    {
      key: "prog3",
      portfolioKey: "p2",
      name: "AML & Fraud Prevention Programme",
      description: "Group-wide AML platform and fraud detection systems",
      status: "Overdue",
      budget: "KES 890M",
    },
    {
      key: "prog4",
      portfolioKey: "p3",
      name: "Enterprise Systems Modernisation",
      description: "Oracle Fusion ERP, HCM and data centre upgrades",
      status: "At Risk",
      budget: "KES 1.1B",
    },
  ],
  projects: [
    {
      code: "P001",
      name: "CBS Phase 1 — Kenya & Uganda",
      type: "Project",
      portfolioKey: "p1",
      programmeKey: "prog1",
      priority: "Strat",
      statusNote: "UAT slip contained to Kenya; recovery plan holds the go-live date.",
      status: "At Risk",
      due: "2026-09-30",
      budget: "KES 650M",
      subs: {
        KE: {
          pct: 72,
          status: "At Risk",
          ms: ["Business Case", "Design", "Procurement", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "done", "active", "late", "pending"],
        },
        UG: {
          pct: 45,
          status: "At Risk",
          ms: ["Business Case", "Design", "Procurement", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "P002",
      name: "CBS Phase 2 — Tanzania & Rwanda",
      type: "Project",
      portfolioKey: "p1",
      programmeKey: "prog1",
      priority: "Critical",
      status: "Planning",
      due: "2026-12-31",
      budget: "KES 580M",
      subs: {
        TZ: {
          pct: 28,
          status: "At Risk",
          ms: ["Business Case", "Design", "Procurement", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "active", "pending", "pending", "pending"],
        },
        RW: {
          pct: 18,
          status: "Planning",
          ms: ["Business Case", "Design", "Procurement", "Build", "UAT", "Go-Live"],
          msSt: ["done", "active", "pending", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "P003",
      name: "CBS Phase 3 — South Sudan",
      type: "Project",
      portfolioKey: "p1",
      programmeKey: "prog1",
      statusNote: "Vendor scoping underway; business case refresh due next week.",
      priority: "High",
      status: "Planning",
      due: "2027-03-31",
      budget: "KES 220M",
      subs: {
        SS: {
          pct: 10,
          status: "Planning",
          ms: ["Business Case", "Design", "Procurement", "Build", "UAT", "Go-Live"],
          msSt: ["done", "pending", "pending", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "P004",
      name: "Mobile Banking 2.0 (Mobi)",
      type: "Project",
      portfolioKey: "p1",
      programmeKey: "prog2",
      priority: "High",
      status: "On Track",
      due: "2026-06-30",
      budget: "KES 620M",
      subs: {
        KE: {
          pct: 88,
          status: "On Track",
          ms: ["Scoping", "Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "done", "done", "active"],
          msDue: [null, null, null, null, "2026-07-20"],
        },
        UG: {
          pct: 78,
          status: "On Track",
          ms: ["Scoping", "Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "done", "active", "pending"],
        },
        TZ: {
          pct: 68,
          status: "On Track",
          ms: ["Scoping", "Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "active", "pending", "pending"],
        },
        RW: {
          pct: 52,
          status: "At Risk",
          ms: ["Scoping", "Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "P005",
      name: "Open Banking API Platform",
      type: "Project",
      portfolioKey: "p1",
      programmeKey: "prog2",
      priority: "High",
      status: "On Track",
      due: "2026-09-15",
      budget: "KES 230M",
      subs: {
        KE: {
          pct: 60,
          status: "On Track",
          ms: ["Design", "Build", "Certification", "Launch"],
          msSt: ["done", "done", "active", "pending"],
        },
        UG: {
          pct: 45,
          status: "On Track",
          ms: ["Design", "Build", "Certification", "Launch"],
          msSt: ["done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "P006",
      name: "AML / Compliance Platform",
      type: "Project",
      portfolioKey: "p2",
      programmeKey: "prog3",
      priority: "Critical",
      status: "Overdue",
      due: "2026-05-31",
      budget: "KES 550M",
      subs: {
        KE: {
          pct: 35,
          status: "Overdue",
          ms: ["Business Case", "Procurement", "Build", "UAT", "Sign-off"],
          msSt: ["done", "done", "active", "late", "pending"],
          msDue: [null, null, null, "2026-06-28", null],
        },
        UG: {
          pct: 28,
          status: "Overdue",
          ms: ["Business Case", "Procurement", "Build", "UAT", "Sign-off"],
          msSt: ["done", "done", "active", "late", "pending"],
        },
        TZ: {
          pct: 18,
          status: "Overdue",
          ms: ["Business Case", "Procurement", "Build", "UAT", "Sign-off"],
          msSt: ["done", "active", "pending", "pending", "pending"],
        },
        RW: {
          pct: 12,
          status: "Overdue",
          ms: ["Business Case", "Procurement", "Build", "UAT", "Sign-off"],
          msSt: ["done", "active", "pending", "pending", "pending"],
        },
        SS: {
          pct: 5,
          status: "Planning",
          ms: ["Business Case", "Procurement", "Build", "UAT", "Sign-off"],
          msSt: ["active", "pending", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "P007",
      name: "Fraud Detection System",
      type: "Project",
      portfolioKey: "p2",
      programmeKey: "prog3",
      priority: "High",
      status: "At Risk",
      due: "2026-08-31",
      budget: "KES 200M",
      subs: {
        KE: {
          pct: 55,
          status: "At Risk",
          ms: ["Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "active", "late", "pending"],
        },
        TZ: {
          pct: 35,
          status: "At Risk",
          ms: ["Design", "Build", "UAT", "Go-Live"],
          msSt: ["done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "P008",
      name: "Oracle Fusion Integration",
      type: "Project",
      portfolioKey: "p3",
      programmeKey: "prog4",
      priority: "High",
      status: "At Risk",
      due: "2026-10-15",
      budget: "KES 350M",
      subs: {
        KE: {
          pct: 58,
          status: "On Track",
          ms: ["Discovery", "Design", "Integration", "UAT", "Cutover"],
          msSt: ["done", "done", "active", "pending", "pending"],
          msDue: [null, null, "2026-07-15", null, null],
        },
        UG: {
          pct: 40,
          status: "At Risk",
          ms: ["Discovery", "Design", "Integration", "UAT", "Cutover"],
          msSt: ["done", "active", "late", "pending", "pending"],
        },
        TZ: {
          pct: 28,
          status: "At Risk",
          ms: ["Discovery", "Design", "Integration", "UAT", "Cutover"],
          msSt: ["done", "active", "pending", "pending", "pending"],
        },
        RW: {
          pct: 18,
          status: "Planning",
          ms: ["Discovery", "Design", "Integration", "UAT", "Cutover"],
          msSt: ["active", "pending", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "P009",
      name: "Group HR System (Oracle HCM)",
      type: "Project",
      portfolioKey: "p3",
      programmeKey: "prog4",
      priority: "Medium",
      status: "On Track",
      due: "2026-11-30",
      budget: "KES 420M",
      subs: {
        KE: {
          pct: 50,
          status: "On Track",
          ms: ["Design", "Config", "UAT", "Go-Live"],
          msSt: ["done", "done", "active", "pending"],
        },
        UG: {
          pct: 45,
          status: "On Track",
          ms: ["Design", "Config", "UAT", "Go-Live"],
          msSt: ["done", "done", "active", "pending"],
        },
        TZ: {
          pct: 35,
          status: "On Track",
          ms: ["Design", "Config", "UAT", "Go-Live"],
          msSt: ["done", "active", "pending", "pending"],
        },
        RW: {
          pct: 30,
          status: "On Track",
          ms: ["Design", "Config", "UAT", "Go-Live"],
          msSt: ["done", "active", "pending", "pending"],
        },
        SS: {
          pct: 15,
          status: "Planning",
          ms: ["Design", "Config", "UAT", "Go-Live"],
          msSt: ["active", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "P010",
      name: "Data Centre Modernisation",
      type: "Project",
      portfolioKey: "p3",
      programmeKey: "prog4",
      priority: "Medium",
      status: "On Track",
      due: "2026-12-01",
      budget: "KES 340M",
      subs: {
        KE: {
          pct: 42,
          status: "On Track",
          ms: ["Assessment", "Design", "Procurement", "Build", "Migration"],
          msSt: ["done", "done", "active", "pending", "pending"],
        },
        TZ: {
          pct: 25,
          status: "On Track",
          ms: ["Assessment", "Design", "Procurement", "Build", "Migration"],
          msSt: ["done", "active", "pending", "pending", "pending"],
        },
      },
    },
    // Standalone programmes/projects (no portfolio/programme)
    {
      code: "SP001",
      name: "FIKRA Digital Lending Programme",
      type: "Programme",
      portfolioKey: null,
      programmeKey: null,
      priority: "High",
      status: "At Risk",
      due: "2026-08-01",
      budget: "KES 480M",
      subs: {
        KE: {
          pct: 65,
          status: "On Track",
          ms: ["Scoping", "Build", "Pilot", "Launch"],
          msSt: ["done", "done", "active", "pending"],
          msDue: [null, null, "2026-07-05", null],
        },
        UG: {
          pct: 55,
          status: "On Track",
          ms: ["Scoping", "Build", "Pilot", "Launch"],
          msSt: ["done", "done", "active", "pending"],
        },
        SS: {
          pct: 30,
          status: "At Risk",
          ms: ["Scoping", "Build", "Pilot", "Launch"],
          msSt: ["done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "SP002",
      name: "KYC Digitisation Programme",
      type: "Programme",
      portfolioKey: null,
      programmeKey: null,
      priority: "High",
      status: "On Track",
      due: "2026-09-01",
      budget: "KES 210M",
      subs: {
        KE: {
          pct: 70,
          status: "On Track",
          ms: ["Design", "Build", "Rollout"],
          msSt: ["done", "done", "active"],
        },
        UG: {
          pct: 60,
          status: "On Track",
          ms: ["Design", "Build", "Rollout"],
          msSt: ["done", "done", "active"],
        },
        TZ: {
          pct: 50,
          status: "On Track",
          ms: ["Design", "Build", "Rollout"],
          msSt: ["done", "active", "pending"],
        },
        RW: {
          pct: 40,
          status: "On Track",
          ms: ["Design", "Build", "Rollout"],
          msSt: ["done", "active", "pending"],
        },
        SS: {
          pct: 25,
          status: "Planning",
          ms: ["Design", "Build", "Rollout"],
          msSt: ["active", "pending", "pending"],
        },
      },
    },
    {
      code: "SP003",
      name: "Cybersecurity Framework Rollout",
      type: "Project",
      portfolioKey: null,
      programmeKey: null,
      priority: "Critical",
      status: "On Track",
      due: "2026-08-31",
      budget: "KES 310M",
      subs: {
        KE: {
          pct: 80,
          status: "On Track",
          ms: ["Assessment", "Design", "Deploy", "Review"],
          msSt: ["done", "done", "done", "active"],
        },
        UG: {
          pct: 65,
          status: "On Track",
          ms: ["Assessment", "Design", "Deploy", "Review"],
          msSt: ["done", "done", "active", "pending"],
        },
        TZ: {
          pct: 55,
          status: "On Track",
          ms: ["Assessment", "Design", "Deploy", "Review"],
          msSt: ["done", "done", "active", "pending"],
        },
        RW: {
          pct: 45,
          status: "On Track",
          ms: ["Assessment", "Design", "Deploy", "Review"],
          msSt: ["done", "active", "pending", "pending"],
        },
        SS: {
          pct: 30,
          status: "At Risk",
          ms: ["Assessment", "Design", "Deploy", "Review"],
          msSt: ["done", "late", "pending", "pending"],
        },
      },
    },
    {
      code: "SP004",
      name: "ESG Reporting Framework",
      type: "Project",
      portfolioKey: null,
      programmeKey: null,
      priority: "Medium",
      status: "At Risk",
      due: "2026-07-31",
      budget: "KES 75M",
      subs: {
        KE: {
          pct: 45,
          status: "At Risk",
          ms: ["Scoping", "Data Mapping", "Reporting"],
          msSt: ["done", "late", "pending"],
        },
        UG: {
          pct: 35,
          status: "At Risk",
          ms: ["Scoping", "Data Mapping", "Reporting"],
          msSt: ["done", "active", "pending"],
        },
        TZ: {
          pct: 20,
          status: "Planning",
          ms: ["Scoping", "Data Mapping", "Reporting"],
          msSt: ["done", "pending", "pending"],
        },
      },
    },
  ],
  risks: [
    {
      title: "AML platform UAT deadline missed across Tanzania and Rwanda",
      projectCode: "P006",
      category: "Regulatory",
      probability: 4,
      impact: 5,
      mitigation: "Escalate vendor resourcing; stand up a dedicated UAT squad in TZ/RW.",
      ownerEmail: "brian.otieno@demo-b.example.invalid",
      status: "Open",
      daysAgo: 3,
    },
    {
      title: "Core banking resourcing gap in Kenya ahead of Phase 3",
      projectCode: "P001",
      category: "Operational",
      probability: 3,
      impact: 4,
      mitigation: "Backfill contractor roles; re-baseline the Phase 3 resourcing plan.",
      ownerEmail: "brian.otieno@demo-b.example.invalid",
      status: "Monitoring",
      daysAgo: 7,
    },
    {
      title: "FIKRA budget overrun risk in South Sudan",
      projectCode: "SP001",
      category: "Financial",
      probability: 4,
      impact: 4,
      mitigation: "Renegotiate South Sudan vendor rates; flag to Finance for contingency draw-down.",
      ownerEmail: "carol.mwangi@demo-b.example.invalid",
      status: "Open",
      daysAgo: 1,
    },
  ],
  issues: [
    {
      title: "AML platform UAT slip materialised into a missed regulatory deadline",
      projectCode: "P006",
      severity: "Critical",
      ownerEmail: "brian.otieno@demo-b.example.invalid",
      status: "Open",
      originRiskTitle: "AML platform UAT deadline missed across Tanzania and Rwanda",
      daysAgo: 2,
    },
    {
      title: "Oracle Fusion procurement sign-off delayed in Uganda",
      projectCode: "P008",
      severity: "Medium",
      ownerEmail: "demo.admin@demo-b.example.invalid",
      status: "Open",
      daysAgo: 5,
    },
    {
      title: "Mobile Banking 2.0 vendor delivery delay across all subsidiaries",
      projectCode: "P004",
      severity: "High",
      ownerEmail: "carol.mwangi@demo-b.example.invalid",
      status: "Open",
      daysAgo: 2,
    },
  ],
};

// ── Riverbank Group — smaller synthetic set for isolation testing ────────────

// ── Riverbank's real, current project portfolio ───────────────────────────────
// Source: docs/Riverbank Projects.docx (as of 2026-07-02). Names, descriptions and stage
// progress are real; team member names are NOT — replaced with generic role placeholders
// per CLAUDE.md's "no real PII in seeds" rule (employee names are confidential personal
// data per docs/11-security-compliance.md). Priority and due dates aren't in the source
// document, so every item is defaulted to "Medium" / no date rather than invented.
const RBS_STAGE_NAMES = [
  "Prototype",
  "Business Case",
  "Business Case Approval (KCB)",
  "BRD",
  "MVP1",
  "SIT",
  "UAT",
  "Go Live",
];
const RBS_MARK_STATE: Record<string, string> = {
  "✓": "done",
  "In Progress": "active",
  "Not Started": "pending",
  Delayed: "late",
  Rejected: "late",
  Deferred: "late",
  "N/A": "pending",
  "-": "pending",
};

interface RbsProjectSource {
  num: number;
  name: string;
  description: string;
  /** 8 marks, in RBS_STAGE_NAMES order, exactly as recorded in the source document. */
  marks: string[];
  teamSize: number;
}

function rbsToProjectSeed(src: RbsProjectSource): ProjectSeed {
  const msSt = src.marks.map((m) => RBS_MARK_STATE[m] ?? "pending");
  const doneCount = src.marks.filter((m) => m === "✓").length;
  const pct = Math.round((doneCount / src.marks.length) * 100);
  const hasBlocker = src.marks.some((m) => m === "Delayed" || m === "Rejected" || m === "Deferred");
  const goLiveDone = msSt[msSt.length - 1] === "done";
  const prototypeDone = msSt[0] === "done";
  const status = goLiveDone ? "Completed" : hasBlocker ? "AtRisk" : !prototypeDone ? "Planning" : "OnTrack";
  const team =
    src.teamSize <= 1
      ? "Project Lead"
      : ["Project Lead", ...Array(src.teamSize - 1).fill("Contributor")].join(", ");

  return {
    code: `RBS-${String(src.num).padStart(2, "0")}`,
    name: src.name,
    description: src.description,
    team,
    type: "Project",
    portfolioKey: null,
    programmeKey: null,
    priority: "Medium",
    status,
    due: null,
    budget: null,
    subs: {
      HQ: { pct, status, ms: RBS_STAGE_NAMES, msSt },
    },
  };
}

const RBS_PROJECTS: RbsProjectSource[] = [
  {
    num: 1,
    name: "HomeQuest",
    description: "Automated rent collection & property workflows",
    marks: ["✓", "✓", "✓", "✓", "✓", "Not Started", "Not Started", "Not Started"],
    teamSize: 2,
  },
  {
    num: 2,
    name: "Asset Valuation",
    description: "Managing details for properties used as collateral in bank lending",
    marks: ["✓", "✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 2,
  },
  {
    num: 3,
    name: "Curis (Insurance)",
    description: "Digital medical scheme administration.",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 4,
    name: "Sifa",
    description: "Faith-based membership & giving automation",
    marks: ["✓", "✓", "✓", "✓", "✓", "In Progress", "Not Started", "Not Started"],
    teamSize: 4,
  },
  {
    num: 5,
    name: "Fikra",
    description: "Group staff innovation hub",
    marks: ["✓", "✓", "✓", "✓", "✓", "Not Started", "Not Started", "Not Started"],
    teamSize: 1,
  },
  {
    num: 6,
    name: "Lumi",
    description: "AI document knowledge platform",
    marks: ["✓", "✓", "Delayed", "Delayed", "Delayed", "Not Started", "Not Started", "Not Started"],
    teamSize: 4,
  },
  {
    num: 8,
    name: "RetailFlow",
    description: "Point of commerce retail solution",
    marks: ["In Progress", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 9,
    name: "Qubit",
    description: "Enterprise project tracking dashboard",
    marks: ["✓", "✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 10,
    name: "Tarion Founders",
    description: "Crowdfunding platform",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 11,
    name: "Checksmart",
    description: "Biometric social-benefit disbursement platform",
    marks: ["✓", "✓", "✓", "✓", "✓", "In Progress", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 12,
    name: "Qora",
    description: "Automated AI-driven document parsing for credit",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 13,
    name: "Vertex",
    description: "Group-wide AI enablement & training",
    marks: ["✓", "✓", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 2,
  },
  {
    num: 14,
    name: "Keza",
    description: "Micro & small enterprise AI-investment platform",
    marks: ["✓", "✓", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 15,
    name: "ZEDFY",
    description: "E-commerce",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 2,
  },
  {
    num: 16,
    name: "ZED-UNO",
    description: "Restaurant and walk-in solution",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 17,
    name: "ZED-WELCO",
    description: "Bookings and accommodation solution",
    marks: ["✓", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 2,
  },
  {
    num: 18,
    name: "ZED-SAFIRI",
    description: "Transport SACCO digital payments & contribution",
    marks: ["✓", "✓", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 19,
    name: "Travira",
    description: "School travel marketplace with embedded financing",
    marks: ["In Progress", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 20,
    name: "Tramia",
    description: "Virtual assets and tokenization",
    marks: ["In Progress", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 21,
    name: "Anchor Pario",
    description: "AI-powered procurement and business case management, replacing Oracle Procurement.",
    marks: ["In Progress", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 22,
    name: "Anchor Genra",
    description: "AI-powered human resource management covering the full hire-to-retire lifecycle, replacing Oracle HCM.",
    marks: ["In Progress", "In Progress", "In Progress", "In Progress", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 23,
    name: "Anchor Fiscus",
    description: "AI-powered financials, replacing Oracle Financials.",
    marks: ["Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 1,
  },
  {
    num: 24,
    name: "Anchor FAL",
    description:
      "The Financial Abstraction Layer, the intelligent middleware that connects all platforms to the financial system of record.",
    marks: ["Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 25,
    name: "Zuqi",
    description: "Field sales & supply chain management platform",
    marks: ["✓", "Rejected", "Rejected", "N/A", "In Progress", "Not Started", "Not Started", "Not Started"],
    teamSize: 3,
  },
  {
    num: 26,
    name: "HELB",
    description: "Field sales & supply chain management platform",
    marks: ["✓", "Deferred", "-", "-", "-", "-", "-", "-"],
    teamSize: 2,
  },
];

const RIVERBANK_SEED: TenantSeed = {
  slug: "riverbank",
  name: "Riverbank Group",
  brandColor: "#ED1C24",
  brandLight: "#FDECEC",
  // riverbank.solutions is Riverbank Solutions Limited's real domain — this tenant is
  // used for the firm's own QUBIT access, alongside the synthetic demo domain below.
  domains: ["riverbank.solutions", "riverbank.example.invalid"],
  orgUnits: [
    // DM1.1: Riverbank is ONE flat organization. A single anchor org unit remains only
    // because ProjectOrgStatus.orgUnitId is non-nullable; it is hidden from the UI by the
    // ≤1-org-unit nav guard. The old WR/CR "regions" were wrong and are removed.
    { code: "HQ", name: "Riverbank" },
    // docs/18 §3.1 — the seven KCB markets Riverbank tracks rollout against. These are
    // Market-kind units, so they never make the tenant look multi-subsidiary: the
    // Subsidiaries nav rule keys on Internal units only (DM1.1 stands).
    { code: "KE", name: "Kenya", flag: "🇰🇪", kind: "Market" },
    { code: "TZ", name: "Tanzania", flag: "🇹🇿", kind: "Market" },
    { code: "UG", name: "Uganda", flag: "🇺🇬", kind: "Market" },
    { code: "RW", name: "Rwanda", flag: "🇷🇼", kind: "Market" },
    { code: "BI", name: "Burundi", flag: "🇧🇮", kind: "Market" },
    { code: "SS", name: "South Sudan", flag: "🇸🇸", kind: "Market" },
    { code: "DRC", name: "DR Congo", flag: "🇨🇩", kind: "Market" },
  ],
  // Flat departments (DM1.1). Riverbank is the firm's REAL tenant, so no synthetic people
  // are seeded — departments start headless and real members (incl. department heads and the
  // Head/Executive/PM roles) are onboarded in-app.
  departments: [
    { name: "HR" },
    { name: "Development" },
    { name: "QA" },
    { name: "PMO" },
    { name: "Executive Office" },
  ],
  // Only the tenant's real super-admin is seeded; every other user is onboarded in-app.
  users: [
    {
      email: "joyce.okore@riverbank.solutions",
      name: "Joyce Okore",
      roles: ["PlatformSuperAdmin"],
      departmentName: "Executive Office",
    },
  ],
  // docs/18 §3.0 — Riverbank delivers into KCB's markets, so it carries one Rollout
  // portfolio whose projects are tracked market-by-market (the heatmap lens).
  portfolios: [
    {
      key: "rollout",
      name: "Market Rollout",
      description: "Products being taken live market by market across the KCB footprint.",
      budget: "—",
      viewKind: "Rollout",
    },
  ],
  programmes: [],
  projects: RBS_PROJECTS.map((src, i) => ({
    ...rbsToProjectSeed(src),
    // The first three products demo the rollout lens; the rest stay unassigned.
    portfolioKey: i < 3 ? "rollout" : null,
  })),
  // Synthetic RAID content (risk/issue text is business data, not personal data) against
  // the real RBS-xx project codes, owned by the already-seeded synthetic Riverbank
  // identities above — added for Milestone 7 so the RAID screen isn't empty on day one.
  risks: [
    {
      title: "Lumi vendor delivery slippage across all three delayed milestones",
      projectCode: "RBS-06",
      category: "Operational",
      probability: 4,
      impact: 4,
      mitigation: "Escalate to vendor account lead; re-baseline BRD/MVP1/SIT dates.",
      ownerEmail: "george.mutuku@riverbank.example.invalid",
      // "Closed" (not "Open") because it's materialised below — matches the invariant
      // src/server/risks.ts's materialiseRisk() enforces (a materialised risk is always
      // "Closed", distinguished from a resolved one only by the issue link).
      status: "Closed",
      daysAgo: 4,
    },
    {
      title: "Zuqi go/no-go pilot pending after two rejected stage gates",
      projectCode: "RBS-25",
      category: "Pilot/Test Area",
      probability: 3,
      impact: 3,
      mitigation: "Re-scope BRD/approval stage before re-attempting the SIT-area pilot.",
      ownerEmail: "farah.karanja@riverbank.example.invalid",
      status: "Monitoring",
      daysAgo: 10,
    },
    {
      title: "RetailFlow SIT resourcing gap ahead of UAT",
      projectCode: "RBS-08",
      category: "Operational",
      probability: 3,
      impact: 3,
      mitigation: "Backfill a QA contractor for the SIT window.",
      ownerEmail: "hannah.chebet@riverbank.example.invalid",
      status: "Open",
      daysAgo: 6,
    },
  ],
  issues: [
    {
      title: "Lumi vendor delay materialised into a missed SIT milestone",
      projectCode: "RBS-06",
      severity: "High",
      ownerEmail: "george.mutuku@riverbank.example.invalid",
      status: "Open",
      originRiskTitle: "Lumi vendor delivery slippage across all three delayed milestones",
      daysAgo: 2,
    },
    {
      title: "Asset Valuation data-mapping discrepancy found in Business Case review",
      projectCode: "RBS-02",
      severity: "Medium",
      ownerEmail: "joyce.okore@riverbank.solutions",
      status: "Open",
      daysAgo: 3,
    },
  ],
};

// ── Seeding machinery ─────────────────────────────────────────────────────────

async function resetTenant(slug: string) {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (!existing) return;

  await withTenant({ tenantId: existing.id, userId: "seed-script" }, async (tx) => {
    // ClickUp transformation tables (leaf → root; the tenant FK is RESTRICT so these
    // must be cleared before the tenant delete below).
    // MVP1 workspace + copilot tables (must clear before the tenant delete — tenant FK is RESTRICT).
    await tx.workComment.deleteMany({});
    await tx.decision.deleteMany({});
    await tx.nudge.deleteMany({});
    await tx.nudgeSnooze.deleteMany({});
    await tx.checkIn.deleteMany({});
    await tx.reportSubscription.deleteMany({});
    await tx.projectSnapshot.deleteMany({});
    await tx.portfolioSnapshot.deleteMany({});
    await tx.domainEvent.deleteMany({});
    await tx.projectMilestone.deleteMany({});
    await tx.projectIntegration.deleteMany({});
    await tx.projectStatusUpdate.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.projectDocument.deleteMany({});
    await tx.blocker.deleteMany({}); // before tasks — blocker.task_id references project_task
    await tx.taskCommitLink.deleteMany({}); // M7-B — RESTRICT tenant FK, clear before tenant delete
    await tx.webhookDelivery.deleteMany({}); // M7-B — no cascade path at all
    await tx.projectTask.deleteMany({});
    await tx.projectTaskCounter.deleteMany({}); // RESTRICT tenant FK — clear before tenant delete
    await tx.aiCallLog.deleteMany({});
    await tx.projectTeam.deleteMany({});
    await tx.projectMember.deleteMany({});
    await tx.teamMember.deleteMany({});
    await tx.team.deleteMany({});

    await tx.projectOrgStatus.deleteMany({});
    await tx.issue.deleteMany({});
    await tx.risk.deleteMany({});
    await tx.project.deleteMany({});
    // Checkpoint templates hold a RESTRICT tenant FK. They are created by the M-D-A
    // migration for already-deployed tenants AND by this seed for freshly created ones,
    // so a reseed must clear them here or the tenant delete trips the constraint.
    await tx.checkpoint.deleteMany({});
    await tx.checkpointTemplate.deleteMany({});
    // M-P1a: both hold RESTRICT tenant FKs (resource_request rows go with their project's
    // cascade, but a reseed clears them explicitly so ordering never matters).
    await tx.resourceRequest.deleteMany({});
    await tx.teamTemplate.deleteMany({});
    await tx.programme.deleteMany({});
    await tx.portfolio.deleteMany({});
    // shared_report + department both hold a RESTRICT tenant FK and must be cleared before
    // the tenant delete. Null the user↔department and department self/head cross-references
    // first so the deleteMany calls don't trip their own FKs (managers, dept heads, parents).
    await tx.sharedReport.deleteMany({});
    await tx.rolePermission.deleteMany({}); // RESTRICT tenant FK — clear before tenant delete
    await tx.joinRequest.deleteMany({}); // cascades with projects, but clear explicitly too
    await tx.user.updateMany({ data: { departmentId: null, managerId: null } });
    await tx.department.updateMany({ data: { headUserId: null, parentId: null } });
    await tx.department.deleteMany({});
    await tx.roleAssignment.deleteMany({});
    await tx.user.deleteMany({});
    await tx.orgUnit.deleteMany({});
    await tx.auditLog.deleteMany({});
  });

  await prisma.tenant.delete({ where: { id: existing.id } });
}

async function seedTenant(seed: TenantSeed) {
  const tenant = await prisma.tenant.create({
    data: {
      slug: seed.slug,
      name: seed.name,
      brandColor: seed.brandColor,
      brandLight: seed.brandLight,
      domains: seed.domains,
    },
  });

  await withTenant({ tenantId: tenant.id, userId: "seed-script" }, async (tx) => {
    const orgUnitIdByCode = new Map<string, string>();
    const orgUnitLabelByCode = new Map<string, string>();
    for (const ou of seed.orgUnits) {
      const created = await tx.orgUnit.create({
        data: { tenantId: tenant.id, code: ou.code, name: ou.name, flag: ou.flag, kind: ou.kind ?? "Internal" },
      });
      orgUnitIdByCode.set(ou.code, created.id);
      orgUnitLabelByCode.set(ou.code, [ou.flag, ou.name].filter(Boolean).join(" "));
    }

    const demoPasswordHash = await hashPassword(DEMO_PASSWORD);
    const userIdByEmail = new Map<string, string>();
    for (const u of seed.users) {
      const created = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: u.email,
          name: u.name,
          status: "ACTIVE",
          passwordHash: demoPasswordHash,
        },
      });
      userIdByEmail.set(u.email, created.id);
      for (const role of u.roles) {
        await tx.roleAssignment.create({
          data: { tenantId: tenant.id, userId: created.id, role },
        });
      }
      // M2 default: oversight roles receive the Friday report. Per-user preferences
      // arrive with the M5 matrix; leads are notified per-project by the check-in job.
      if (u.roles.some((r) => ["Executive", "HeadOfProjects", "HeadOfQA", "PlatformSuperAdmin"].includes(r))) {
        await tx.reportSubscription.create({
          data: { tenantId: tenant.id, userId: created.id, kind: "weekly_report" },
        });
      }
    }

    // Departments (DM1.1) — flat for Riverbank (orgUnitId left unset); leadership is
    // expressed via headUserId + Head roles, not a separate department. Created after users
    // so headUserEmail resolves; user placement is applied straight after.
    const departmentIdByName = new Map<string, string>();
    for (const d of seed.departments ?? []) {
      const created = await tx.department.create({
        data: {
          tenantId: tenant.id,
          name: d.name,
          headUserId: d.headUserEmail ? (userIdByEmail.get(d.headUserEmail) ?? null) : null,
        },
      });
      departmentIdByName.set(d.name, created.id);
    }
    for (const u of seed.users) {
      if (!u.departmentName) continue;
      const departmentId = departmentIdByName.get(u.departmentName);
      const userId = userIdByEmail.get(u.email);
      if (!departmentId || !userId) continue;
      await tx.user.update({ where: { id: userId }, data: { departmentId } });
    }

    const portfolioIdByKey = new Map<string, string>();
    for (const p of seed.portfolios) {
      const created = await tx.portfolio.create({
        data: {
          tenantId: tenant.id,
          name: p.name,
          description: p.description,
          targetBudget: p.budget,
          viewKind: p.viewKind ?? "Pipeline",
          // M-P1a: seeded portfolios are live delivery work (mirrors the prod backfill).
          category: "Approved",
        },
      });
      portfolioIdByKey.set(p.key, created.id);
    }
    // docs/18 §0.5 — every project belongs to a portfolio; standalone seeds land here.
    const unassigned = await tx.portfolio.create({
      data: {
        tenantId: tenant.id,
        name: "Unassigned",
        description: "Default portfolio — projects awaiting a portfolio decision (docs/18 §0.5).",
        viewKind: "Pipeline",
        category: "Approved",
      },
    });

    const programmeIdByKey = new Map<string, string>();
    for (const pr of seed.programmes) {
      const created = await tx.programme.create({
        data: {
          tenantId: tenant.id,
          portfolioId: portfolioIdByKey.get(pr.portfolioKey) ?? null,
          name: pr.name,
          description: pr.description,
          status: mapStatus(pr.status),
          category: "Approved", // M-P1a: seeded programmes are live delivery work
          budget: pr.budget,
        },
      });
      programmeIdByKey.set(pr.key, created.id);
    }

    const projectIdByCode = new Map<string, string>();
    for (const proj of seed.projects) {
      const created = await tx.project.create({
        data: {
          tenantId: tenant.id,
          code: proj.code,
          name: proj.name,
          description: proj.description ?? null,
          type: proj.type,
          portfolioId: proj.portfolioKey ? (portfolioIdByKey.get(proj.portfolioKey) ?? unassigned.id) : unassigned.id,
          programmeId: proj.programmeKey ? (programmeIdByKey.get(proj.programmeKey) ?? null) : null,
          priority: mapPriority(proj.priority),
          // docs/18 §1: demo the four pipeline groups deterministically — Planning
          // projects alternate Exploring/Evaluating; live delivery is Approved;
          // cancelled reads Paused.
          pipelineStage: mapPipelineStage(mapStatus(proj.status), seed.projects.indexOf(proj)),
          statusNote: proj.statusNote ?? null,
          status: mapStatus(proj.status),
          dueDate: proj.due ? new Date(proj.due) : null,
          budget: proj.budget,
          team: proj.team ?? null,
        },
      });
      projectIdByCode.set(proj.code, created.id);

      for (const [orgCode, sub] of Object.entries(proj.subs)) {
        const orgUnitId = orgUnitIdByCode.get(orgCode);
        if (!orgUnitId) continue;
        await tx.projectOrgStatus.create({
          data: {
            tenantId: tenant.id,
            projectId: created.id,
            orgUnitId,
            progress: sub.pct,
            status: mapStatus(sub.status),
          },
        });
        // Milestones live on ProjectMilestone since the M1 merge; the subsidiary context
        // is baked into the name, mirroring the 20260728150000 migration's mapping.
        for (let i = 0; i < sub.ms.length; i++) {
          const dueDate = sub.msDue?.[i];
          await tx.projectMilestone.create({
            data: {
              tenantId: tenant.id,
              projectId: created.id,
              name: [orgUnitLabelByCode.get(orgCode), sub.ms[i]].filter(Boolean).join(" "),
              status: sub.msSt[i] === "done" ? "Done" : "Pending",
              orderIndex: i,
              dueDate: dueDate ? new Date(dueDate) : null,
            },
          });
        }
      }
    }

    const riskIdByTitle = new Map<string, string>();
    for (const r of seed.risks) {
      const created = await tx.risk.create({
        data: {
          tenantId: tenant.id,
          projectId: r.projectCode ? (projectIdByCode.get(r.projectCode) ?? null) : null,
          title: r.title,
          category: r.category,
          probability: r.probability,
          impact: r.impact,
          mitigation: r.mitigation,
          ownerId: userIdByEmail.get(r.ownerEmail),
          status: r.status,
          createdAt: daysAgoToDate(r.daysAgo),
        },
      });
      riskIdByTitle.set(r.title, created.id);
    }

    for (const i of seed.issues) {
      await tx.issue.create({
        data: {
          tenantId: tenant.id,
          projectId: i.projectCode ? (projectIdByCode.get(i.projectCode) ?? null) : null,
          originRiskId: i.originRiskTitle ? riskIdByTitle.get(i.originRiskTitle) : null,
          title: i.title,
          severity: i.severity,
          ownerId: userIdByEmail.get(i.ownerEmail),
          status: i.status,
          createdAt: daysAgoToDate(i.daysAgo),
        },
      });
    }

    // ── Phase 6.1 (docs/15) — typed, keyed board tasks on each tenant's first project so
    // the taxonomy is demo-visible: statuses spread across the five columns, one Bug, and
    // one task flagged blocked via a linked Open blocker. Keys are pre-allocated here, so
    // the counter row starts past them. Synthetic titles only — no PII.
    const firstProject = seed.projects[0] ? projectIdByCode.get(seed.projects[0].code) : undefined;
    const seedUserId = [...userIdByEmail.values()][0];
    if (firstProject && seedUserId) {
      const code = seed.projects[0].code;
      // The demo project gets a real PM: first user leads it and is enrolled as a
      // Project Manager member (mirrors createProject's behaviour, DM1.17) — so the
      // MINE filters, member counts and join-request routing have data to show.
      await tx.project.update({ where: { id: firstProject }, data: { leadUserId: seedUserId } });
      await tx.projectMember.create({
        data: { tenantId: tenant.id, projectId: firstProject, userId: seedUserId, role: "Project Manager" },
      });
      const demoTasks = [
        { title: "Confirm scope with business owner", type: "Feature", status: "Completed", phase: "Requirements" },
        { title: "Build data-export service", type: "Feature", status: "InProgress", phase: "Development" },
        { title: "Fix pagination on audit view", type: "Bug", severity: "High", status: "InQA", phase: "Testing" },
        { title: "Update runbook for release", type: "Chore", status: "NotStarted", phase: "Deployment" },
      ] as const;
      for (let i = 0; i < demoTasks.length; i++) {
        const t = demoTasks[i];
        await tx.projectTask.create({
          data: {
            tenantId: tenant.id,
            projectId: firstProject,
            title: t.title,
            type: t.type,
            severity: "severity" in t ? t.severity : null,
            status: t.status,
            phase: t.phase,
            priority: "Medium",
            taskKey: `${code}-${i + 1}`,
            reporterId: seedUserId,
            assigneeId: seedUserId,
            orderIndex: i,
          },
        });
      }
      await tx.projectTaskCounter.create({
        data: { tenantId: tenant.id, projectId: firstProject, next: demoTasks.length + 1 },
      });
      const blockedTask = await tx.projectTask.findFirst({
        where: { projectId: firstProject, status: "InProgress" },
        select: { id: true },
      });
      if (blockedTask) {
        await tx.blocker.create({
          data: {
            tenantId: tenant.id,
            projectId: firstProject,
            taskId: blockedTask.id,
            description: "Waiting on upstream API credentials",
            severity: "Medium",
            status: "Open",
            ownerId: seedUserId,
          },
        });
      }

      // ── M1c (docs/17 §5/§7) — QA + Implementor demo members on the first project so
      // both new personas render real content out of the box. Synthetic accounts only —
      // prefer the tenant's .invalid domain so no demo account sits on a real one.
      const domain = seed.domains.find((d) => d.endsWith(".invalid")) ?? seed.domains[0];
      const qaUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `qa.demo@${domain}`,
          name: "QA Demo",
          status: "ACTIVE",
          passwordHash: demoPasswordHash,
          userGroups: ["qa"],
          primaryGroup: "qa",
        },
      });
      await tx.roleAssignment.create({ data: { tenantId: tenant.id, userId: qaUser.id, role: "Member" } });
      await tx.projectMember.create({
        data: { tenantId: tenant.id, projectId: firstProject, userId: qaUser.id, role: "QA Engineer" },
      });
      const implUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `impl.demo@${domain}`,
          name: "Implementor Demo",
          status: "ACTIVE",
          passwordHash: demoPasswordHash,
          userGroups: ["implementor"],
          primaryGroup: "implementor",
        },
      });
      await tx.roleAssignment.create({ data: { tenantId: tenant.id, userId: implUser.id, role: "Member" } });
      await tx.projectMember.create({
        data: { tenantId: tenant.id, projectId: firstProject, userId: implUser.id, role: "Implementation Lead" },
      });
      // QA fixtures: a critical bug awaiting triage + a bug the QA demo raised.
      await tx.projectTask.create({
        data: {
          tenantId: tenant.id,
          projectId: firstProject,
          title: "Session drops on statement download over weak connectivity",
          type: "Bug",
          severity: "Critical",
          status: "NotStarted",
          phase: "Testing",
          priority: "Critical",
          taskKey: `${code}-5`,
          reporterId: qaUser.id,
        },
      });
      await tx.projectTask.create({
        data: {
          tenantId: tenant.id,
          projectId: firstProject,
          title: "Rounding error on FX rate display",
          type: "Bug",
          severity: "Medium",
          status: "InProgress",
          phase: "Testing",
          priority: "Medium",
          taskKey: `${code}-6`,
          reporterId: qaUser.id,
          assigneeId: seedUserId,
        },
      });
      await tx.projectTaskCounter.update({ where: { projectId: firstProject }, data: { next: 7 } });
      // Implementor fixtures: a rollout window (UAT/pilot milestones) + a handover doc.
      const in9d = new Date(Date.now() + 9 * 86_400_000);
      const in16d = new Date(Date.now() + 16 * 86_400_000);
      await tx.projectMilestone.createMany({
        data: [
          { tenantId: tenant.id, projectId: firstProject, name: "SIT complete", status: "Done", orderIndex: 0 },
          { tenantId: tenant.id, projectId: firstProject, name: "UAT sign-off — pilot branch", status: "Pending", dueDate: in9d, orderIndex: 1 },
          { tenantId: tenant.id, projectId: firstProject, name: "Go-live — pilot branch", status: "Pending", dueDate: in16d, orderIndex: 2 },
        ],
      });
      await tx.projectDocument.create({
        data: {
          tenantId: tenant.id,
          projectId: firstProject,
          title: "Operations handover pack",
          kind: "Handover",
          status: "InReview",
          createdById: implUser.id,
        },
      });
    }

    // ── M-D-A (docs/18 §2) — the two checkpoint templates. The migration creates these
    // for tenants that already exist; a freshly seeded tenant needs them here, so both
    // paths converge on the same two templates.
    const TEMPLATES: { name: string; description: string; gates: string[] }[] = [
      {
        name: "Product build",
        description: "Build-out gates for a product or platform (docs/18 §2).",
        gates: ["BRD", "Prototype", "MVP1", "SIT", "UAT", "Go-Live"],
      },
      {
        name: "Market rollout",
        description: "Gates for taking a product into a market (docs/18 §2).",
        gates: ["Business Case", "Contract", "Solution Build", "Bank Integration", "Telco Integration", "Testing", "GTM/Pilot", "Rollout"],
      },
    ];
    for (const t of TEMPLATES) {
      await tx.checkpointTemplate.create({
        data: {
          tenantId: tenant.id,
          name: t.name,
          description: t.description,
          checkpoints: { create: t.gates.map((name, orderIndex) => ({ tenantId: tenant.id, name, orderIndex })) },
        },
      });
    }

    // M-P1a (docs/27) — the team shape the project wizard applies in one click.
    await tx.teamTemplate.create({
      data: {
        tenantId: tenant.id,
        name: "Standard build",
        shape: [
          { role: "Project Manager", allocationPct: 20 },
          { role: "Technical Lead", allocationPct: 40 },
          { role: "Developer", allocationPct: 60 },
          { role: "Developer", allocationPct: 60 },
          { role: "QA Engineer", allocationPct: 60 },
          { role: "Implementor", allocationPct: 50 },
        ],
      },
    });

    // Attach "Product build" to the demo project and walk its first gates so the derived
    // % and the pipeline gate ticks have real data to show.
    if (firstProject) {
      const template = await tx.checkpointTemplate.findFirst({
        where: { name: "Product build" },
        select: { id: true, checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } },
      });
      if (template) {
        await tx.project.update({ where: { id: firstProject }, data: { checkpointTemplateId: template.id } });
        // BRD + Prototype done, MVP1 in progress → derived 42% on a 6-gate template.
        const states = ["Done", "Done", "InProgress"];
        for (let i = 0; i < states.length && i < template.checkpoints.length; i++) {
          await tx.checkpointStatus.create({
            data: {
              tenantId: tenant.id,
              projectId: firstProject,
              checkpointId: template.checkpoints[i].id,
              orgUnitId: null,
              state: states[i],
            },
          });
        }
      }
    }

    // ── M-D-B (docs/18 §3.1) — market tracks for the Rollout portfolio. A track is a
    // ProjectOrgStatus row against a Market org unit (the model reused, not duplicated),
    // plus per-market CheckpointStatus rows whose states drive the cell's derived %.
    const rolloutPortfolioId = portfolioIdByKey.get("rollout");
    if (rolloutPortfolioId) {
      const marketUnits = await tx.orgUnit.findMany({ where: { kind: "Market" }, orderBy: { createdAt: "asc" }, select: { id: true, code: true } });
      const rolloutTemplate = await tx.checkpointTemplate.findFirst({
        where: { name: "Market rollout" },
        select: { id: true, checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } },
      });
      const rolloutProjects = await tx.project.findMany({
        where: { portfolioId: rolloutPortfolioId },
        select: { id: true },
        orderBy: { code: "asc" },
      });
      // Deterministic demo spread: each project ships into the first N markets, each a
      // little further along than the next, so the heatmap has real variety to show.
      const TRACK_SHAPES = [
        { markets: 4, done: [6, 4, 3, 1], status: ["OnTrack", "OnTrack", "AtRisk", "Planning"] },
        { markets: 3, done: [5, 2, 1], status: ["OnTrack", "AtRisk", "Planning"] },
        { markets: 2, done: [8, 3], status: ["OnTrack", "OnTrack"] },
      ];
      for (let pi = 0; pi < rolloutProjects.length && pi < TRACK_SHAPES.length; pi++) {
        const project = rolloutProjects[pi];
        const shape = TRACK_SHAPES[pi];
        if (rolloutTemplate) {
          await tx.project.update({ where: { id: project.id }, data: { checkpointTemplateId: rolloutTemplate.id } });
        }
        for (let mi = 0; mi < shape.markets && mi < marketUnits.length; mi++) {
          const market = marketUnits[mi];
          const doneCount = shape.done[mi] ?? 0;
          const gates = rolloutTemplate?.checkpoints ?? [];
          const pct = gates.length ? Math.round((doneCount / gates.length) * 100) : 0;
          await tx.projectOrgStatus.create({
            data: { tenantId: tenant.id, projectId: project.id, orgUnitId: market.id, progress: pct, status: shape.status[mi] ?? "OnTrack" },
          });
          for (let gi = 0; gi < gates.length; gi++) {
            const state = gi < doneCount ? "Done" : gi === doneCount ? "InProgress" : "NotStarted";
            await tx.checkpointStatus.create({
              data: { tenantId: tenant.id, projectId: project.id, checkpointId: gates[gi].id, orgUnitId: market.id, state },
            });
          }
        }
      }
    }

    // ── Demo sparkline history — SYNTHETIC fixture tenant ONLY ────────────────
    // 14 days of PortfolioSnapshot so the fixture dashboard's KPI sparklines have a
    // demo trend. Riverbank (the real tenant) gets NO fabricated history: its sparklines
    // stay in the honest empty state until the nightly-snapshot job accrues real nights.
    if (seed.slug === "demo-b") {
      const statuses = (await tx.project.findMany({ select: { status: true } })).map((p) => p.status);
      const current = portfolioHealth(statuses);
      const now = new Date();
      const tasksOverdue = await tx.projectTask.count({
        where: { dueDate: { lt: now }, status: { not: "Completed" }, approvalStatus: { not: "Draft" } },
      });
      const allocations = await tx.projectMember.groupBy({
        by: ["userId"],
        _sum: { allocationPct: true },
      });
      const peopleAllocated = allocations.length;
      const peopleOverAllocated = allocations.filter((a) => (a._sum.allocationPct ?? 0) > 100).length;

      for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
        const d = new Date(now.getTime() - daysAgo * 86_400_000);
        const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        // Deterministic mild trend toward today's real values.
        const onTrack = Math.max(0, current.onTrack - Math.ceil(daysAgo / 4));
        const needAttention = current.needAttention + (current.onTrack - onTrack);
        await tx.portfolioSnapshot.create({
          data: {
            tenantId: tenant.id,
            day,
            projects: current.total,
            onTrack,
            needAttention,
            planning: current.planning,
            onTrackPct: current.total ? Math.round((onTrack / current.total) * 100) : 0,
            tasksOverdue: tasksOverdue + Math.ceil(daysAgo / 3),
            peopleAllocated,
            peopleOverAllocated,
          },
        });
      }
    }
  });

  return tenant;
}

async function main() {
  // "kcb" is reset (tenant row deleted) so dev databases seeded before M10 come out
  // clean; the customer is gone — its old demo dataset lives on as Demo Org B.
  await resetTenant("kcb");
  await resetTenant("demo-b");
  await resetTenant("riverbank");

  const demoB = await seedTenant(DEMO_B_SEED);
  const riverbank = await seedTenant(RIVERBANK_SEED);

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

  console.log(`Seeded ${riverbank.name} (slug: ${riverbank.slug}) + fixture ${demoB.name} (slug: ${demoB.slug}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
