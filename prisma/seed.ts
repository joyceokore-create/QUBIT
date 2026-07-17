// QUBIT synthetic seed data. See docs/05-data-model.md.
// KCB Group mirrors docs/design-reference-exec-dashboard.html; Riverbank Group is a
// smaller synthetic set for demonstrating tenant isolation. No real PII — every email is
// @example.invalid and every name is fictional.

import type { Prisma, StatusType } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { withTenant } from "../src/lib/tenant";
import { hashPassword } from "../src/lib/password";
import { ORDER_STEP } from "../src/server/ordering";

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

function daysAgoToDate(daysAgo?: number): Date | undefined {
  return daysAgo === undefined ? undefined : new Date(Date.now() - daysAgo * 86_400_000);
}

interface OrgUnitSeed {
  code: string;
  name: string;
  flag?: string;
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

// ── KCB Group — mirrors the dashboard reference exactly ──────────────────────

const KCB_SEED: TenantSeed = {
  slug: "kcb",
  name: "KCB Group",
  brandColor: "#1B7A3E",
  brandLight: "#E8F5EE",
  domains: ["kcb.example.invalid"],
  orgUnits: [
    { code: "KE", name: "KCB Kenya", flag: "🇰🇪" },
    { code: "UG", name: "KCB Uganda", flag: "🇺🇬" },
    { code: "TZ", name: "KCB Tanzania", flag: "🇹🇿" },
    { code: "RW", name: "KCB Rwanda", flag: "🇷🇼" },
    { code: "SS", name: "KCB South Sudan", flag: "🇸🇸" },
  ],
  // Only the tenant's super-admin is seeded — every other user is onboarded in-app.
  users: [
    { email: "daniel.kiptoo@kcb.example.invalid", name: "Daniel Kiptoo", roles: ["PlatformSuperAdmin"] },
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
      priority: "Critical",
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
      ownerEmail: "brian.otieno@kcb.example.invalid",
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
      ownerEmail: "brian.otieno@kcb.example.invalid",
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
      ownerEmail: "carol.mwangi@kcb.example.invalid",
      status: "Open",
      daysAgo: 1,
    },
  ],
  issues: [
    {
      title: "AML platform UAT slip materialised into a missed regulatory deadline",
      projectCode: "P006",
      severity: "Critical",
      ownerEmail: "brian.otieno@kcb.example.invalid",
      status: "Open",
      originRiskTitle: "AML platform UAT deadline missed across Tanzania and Rwanda",
      daysAgo: 2,
    },
    {
      title: "Oracle Fusion procurement sign-off delayed in Uganda",
      projectCode: "P008",
      severity: "Medium",
      ownerEmail: "daniel.kiptoo@kcb.example.invalid",
      status: "Open",
      daysAgo: 5,
    },
    {
      title: "Mobile Banking 2.0 vendor delivery delay across all subsidiaries",
      projectCode: "P004",
      severity: "High",
      ownerEmail: "carol.mwangi@kcb.example.invalid",
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
  portfolios: [],
  programmes: [],
  projects: RBS_PROJECTS.map(rbsToProjectSeed),
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
    await tx.projectMilestone.deleteMany({});
    await tx.projectIntegration.deleteMany({});
    await tx.projectStatusUpdate.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.projectDocument.deleteMany({});
    await tx.projectTask.deleteMany({});
    await tx.blocker.deleteMany({});
    await tx.aiCallLog.deleteMany({});
    await tx.projectTeam.deleteMany({});
    await tx.projectMember.deleteMany({});
    await tx.teamMember.deleteMany({});
    await tx.team.deleteMany({});
    await tx.activity.deleteMany({});
    await tx.automationRun.deleteMany({});
    await tx.automation.deleteMany({});
    await tx.timeEntry.deleteMany({});
    await tx.view.deleteMany({});
    await tx.fieldValue.deleteMany({});
    await tx.fieldDefinition.deleteMany({});
    await tx.comment.deleteMany({});
    await tx.checklistItem.deleteMany({});
    await tx.checklist.deleteMany({});
    await tx.taskDependency.deleteMany({});
    await tx.taskWatcher.deleteMany({});
    await tx.taskAssignee.deleteMany({});
    await tx.taskTag.deleteMany({});
    await tx.task.deleteMany({});
    await tx.tag.deleteMany({});
    await tx.status.deleteMany({});
    await tx.statusGroup.deleteMany({});
    await tx.list.deleteMany({});
    await tx.folder.deleteMany({});
    await tx.space.deleteMany({});

    await tx.milestone.deleteMany({});
    await tx.projectOrgStatus.deleteMany({});
    await tx.issue.deleteMany({});
    await tx.risk.deleteMany({});
    await tx.project.deleteMany({});
    await tx.programme.deleteMany({});
    await tx.portfolio.deleteMany({});
    // shared_report + department both hold a RESTRICT tenant FK and must be cleared before
    // the tenant delete. Null the user↔department and department self/head cross-references
    // first so the deleteMany calls don't trip their own FKs (managers, dept heads, parents).
    await tx.sharedReport.deleteMany({});
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
    for (const ou of seed.orgUnits) {
      const created = await tx.orgUnit.create({
        data: { tenantId: tenant.id, code: ou.code, name: ou.name, flag: ou.flag },
      });
      orgUnitIdByCode.set(ou.code, created.id);
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
        },
      });
      portfolioIdByKey.set(p.key, created.id);
    }

    const programmeIdByKey = new Map<string, string>();
    for (const pr of seed.programmes) {
      const created = await tx.programme.create({
        data: {
          tenantId: tenant.id,
          portfolioId: portfolioIdByKey.get(pr.portfolioKey) ?? null,
          name: pr.name,
          description: pr.description,
          status: mapStatus(pr.status),
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
          portfolioId: proj.portfolioKey ? (portfolioIdByKey.get(proj.portfolioKey) ?? null) : null,
          programmeId: proj.programmeKey ? (programmeIdByKey.get(proj.programmeKey) ?? null) : null,
          priority: proj.priority,
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
        const pos = await tx.projectOrgStatus.create({
          data: {
            tenantId: tenant.id,
            projectId: created.id,
            orgUnitId,
            progress: sub.pct,
            status: mapStatus(sub.status),
          },
        });
        for (let i = 0; i < sub.ms.length; i++) {
          const dueDate = sub.msDue?.[i];
          await tx.milestone.create({
            data: {
              tenantId: tenant.id,
              projectOrgStatusId: pos.id,
              name: sub.ms[i],
              sequence: i,
              state: sub.msSt[i],
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

    // ── ClickUp transformation demo (docs/clickup-transformation) — additive ──
    // A minimal Space → Folder → List → tasks tree per tenant so GET /hierarchy
    // returns a real tree and Phase 1 has something to render.
    const creatorId = [...userIdByEmail.values()][0];
    if (creatorId) {
      await seedClickupDemo(tx, tenant.id, creatorId);
    }
  });

  return tenant;
}

// Status set per the migration guide's mapping (docs/.../07-migration-guide.md).
// colorToken values are semantic token keys (never raw hex).
const DEMO_STATUSES: { name: string; colorToken: string; type: StatusType }[] = [
  { name: "Planning", colorToken: "info", type: "OPEN" },
  { name: "In Progress", colorToken: "brand", type: "ACTIVE" },
  { name: "At Risk", colorToken: "warn", type: "ACTIVE" },
  { name: "Blocked", colorToken: "bad", type: "ACTIVE" },
  { name: "Done", colorToken: "ok", type: "DONE" },
  { name: "Cancelled", colorToken: "neutral", type: "CLOSED" },
];

async function seedClickupDemo(tx: Prisma.TransactionClient, tenantId: string, creatorId: string) {
  const space = await tx.space.create({
    data: {
      tenantId,
      name: "Delivery",
      icon: "🚀",
      color: "brand",
      orderIndex: ORDER_STEP,
      settings: { dependencies: true, timeTracking: true, customFields: true },
    },
  });

  const statusGroup = await tx.statusGroup.create({
    data: { tenantId, spaceId: space.id, name: "Default" },
  });
  const statusIdByName = new Map<string, string>();
  for (let i = 0; i < DEMO_STATUSES.length; i++) {
    const s = DEMO_STATUSES[i];
    const created = await tx.status.create({
      data: {
        tenantId,
        statusGroupId: statusGroup.id,
        name: s.name,
        colorToken: s.colorToken,
        type: s.type,
        orderIndex: ORDER_STEP * (i + 1),
      },
    });
    statusIdByName.set(s.name, created.id);
  }

  const folder = await tx.folder.create({
    data: { tenantId, spaceId: space.id, name: "2026 Programmes", orderIndex: ORDER_STEP },
  });

  // Folderless list (inherits the space's status group) + a list inside the folder.
  const quickWins = await tx.list.create({
    data: { tenantId, spaceId: space.id, name: "Quick Wins", orderIndex: ORDER_STEP },
  });
  const coreBanking = await tx.list.create({
    data: {
      tenantId,
      spaceId: space.id,
      folderId: folder.id,
      name: "Core Banking Rollout",
      statusGroupId: statusGroup.id,
      orderIndex: ORDER_STEP,
    },
  });

  const demoTasks: { list: string; name: string; status: string; milestone?: boolean }[] = [
    { list: quickWins.id, name: "Draft steering pack template", status: "In Progress" },
    { list: quickWins.id, name: "Confirm reporting cadence", status: "Planning" },
    { list: coreBanking.id, name: "Vendor selection sign-off", status: "At Risk" },
    { list: coreBanking.id, name: "Migrate pilot branch", status: "Blocked" },
    { list: coreBanking.id, name: "Phase 1 go-live", status: "Planning", milestone: true },
  ];
  let seq = 1;
  for (let i = 0; i < demoTasks.length; i++) {
    const t = demoTasks[i];
    await tx.task.create({
      data: {
        tenantId,
        listId: t.list,
        name: t.name,
        statusId: statusIdByName.get(t.status)!,
        isMilestone: t.milestone ?? false,
        orderIndex: ORDER_STEP * (i + 1),
        createdById: creatorId,
        seq: seq++,
      },
    });
  }
}

async function main() {
  await resetTenant("kcb");
  await resetTenant("riverbank");

  const kcb = await seedTenant(KCB_SEED);
  const riverbank = await seedTenant(RIVERBANK_SEED);

  console.log(`Seeded ${kcb.name} (slug: ${kcb.slug}) and ${riverbank.name} (slug: ${riverbank.slug}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
