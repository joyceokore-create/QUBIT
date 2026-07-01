// QUBIT synthetic seed data. See docs/05-data-model.md.
// KCB Group mirrors docs/design-reference-exec-dashboard.html; Riverbank Group is a
// smaller synthetic set for demonstrating tenant isolation. No real PII — every email is
// @example.invalid and every name is fictional.

import { prisma } from "../src/lib/db";
import { withTenant } from "../src/lib/tenant";
import { hashPassword } from "../src/lib/password";

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

interface OrgUnitSeed {
  code: string;
  name: string;
  flag?: string;
}
interface UserSeed {
  email: string;
  name: string;
  role: string;
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
}
interface ProjectSeed {
  code: string;
  name: string;
  type: "Project" | "Programme";
  portfolioKey: string | null;
  programmeKey: string | null;
  priority: string;
  status: string;
  due: string | null;
  budget: string;
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
}
interface IssueSeed {
  title: string;
  projectCode: string | null;
  severity: string;
  ownerEmail: string;
  status: string;
  originRiskTitle?: string;
}
interface TenantSeed {
  slug: string;
  name: string;
  brandColor: string;
  brandLight: string;
  orgUnits: OrgUnitSeed[];
  users: UserSeed[];
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
  orgUnits: [
    { code: "KE", name: "KCB Kenya", flag: "🇰🇪" },
    { code: "UG", name: "KCB Uganda", flag: "🇺🇬" },
    { code: "TZ", name: "KCB Tanzania", flag: "🇹🇿" },
    { code: "RW", name: "KCB Rwanda", flag: "🇷🇼" },
    { code: "SS", name: "KCB South Sudan", flag: "🇸🇸" },
  ],
  users: [
    { email: "amina.ndungu@example.invalid", name: "Amina Ndungu", role: "PortfolioManager" },
    { email: "brian.otieno@example.invalid", name: "Brian Otieno", role: "ProjectManager" },
    { email: "carol.mwangi@example.invalid", name: "Carol Mwangi", role: "ProjectManager" },
    { email: "daniel.kiptoo@example.invalid", name: "Daniel Kiptoo", role: "SystemAdmin" },
    { email: "evelyn.wanjiru@example.invalid", name: "Evelyn Wanjiru", role: "Viewer" },
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
      ownerEmail: "brian.otieno@example.invalid",
      status: "Open",
    },
    {
      title: "Core banking resourcing gap in Kenya ahead of Phase 3",
      projectCode: "P001",
      category: "Operational",
      probability: 3,
      impact: 4,
      mitigation: "Backfill contractor roles; re-baseline the Phase 3 resourcing plan.",
      ownerEmail: "brian.otieno@example.invalid",
      status: "Monitoring",
    },
    {
      title: "FIKRA budget overrun risk in South Sudan",
      projectCode: "SP001",
      category: "Financial",
      probability: 4,
      impact: 4,
      mitigation: "Renegotiate South Sudan vendor rates; flag to Finance for contingency draw-down.",
      ownerEmail: "carol.mwangi@example.invalid",
      status: "Open",
    },
  ],
  issues: [
    {
      title: "AML platform UAT slip materialised into a missed regulatory deadline",
      projectCode: "P006",
      severity: "Critical",
      ownerEmail: "brian.otieno@example.invalid",
      status: "Open",
      originRiskTitle: "AML platform UAT deadline missed across Tanzania and Rwanda",
    },
    {
      title: "Oracle Fusion procurement sign-off delayed in Uganda",
      projectCode: "P008",
      severity: "Medium",
      ownerEmail: "daniel.kiptoo@example.invalid",
      status: "Open",
    },
    {
      title: "Mobile Banking 2.0 vendor delivery delay across all subsidiaries",
      projectCode: "P004",
      severity: "High",
      ownerEmail: "carol.mwangi@example.invalid",
      status: "Open",
    },
  ],
};

// ── Riverbank Group — smaller synthetic set for isolation testing ────────────

const RIVERBANK_SEED: TenantSeed = {
  slug: "riverbank",
  name: "Riverbank Group",
  brandColor: "#ED1C24",
  brandLight: "#FDECEC",
  orgUnits: [
    { code: "HQ", name: "Riverbank Head Office" },
    { code: "WR", name: "Riverbank West Region" },
    { code: "CR", name: "Riverbank Coast Region" },
  ],
  users: [
    { email: "farah.karanja@example.invalid", name: "Farah Karanja", role: "PortfolioManager" },
    { email: "george.mutuku@example.invalid", name: "George Mutuku", role: "ProjectManager" },
    { email: "hannah.chebet@example.invalid", name: "Hannah Chebet", role: "SystemAdmin" },
  ],
  portfolios: [
    {
      key: "rb-p1",
      name: "Client Delivery Platforms",
      description: "Client-facing delivery and collaboration platforms for Riverbank engagements.",
      budget: "KES 450M",
    },
    {
      key: "rb-p2",
      name: "Internal Systems Modernisation",
      description: "Internal ERP, HR and security tooling upgrades.",
      budget: "KES 210M",
    },
  ],
  programmes: [
    {
      key: "rb-prog1",
      portfolioKey: "rb-p1",
      name: "Delivery Portal Programme",
      description: "Client portal and reporting programme",
      status: "On Track",
      budget: "KES 260M",
    },
    {
      key: "rb-prog2",
      portfolioKey: "rb-p2",
      name: "ERP Upgrade Programme",
      description: "Finance and HR ERP modernisation",
      status: "At Risk",
      budget: "KES 150M",
    },
  ],
  projects: [
    {
      code: "RBP001",
      name: "Client Portal Revamp",
      type: "Project",
      portfolioKey: "rb-p1",
      programmeKey: "rb-prog1",
      priority: "High",
      status: "On Track",
      due: "2026-10-31",
      budget: "KES 120M",
      subs: {
        HQ: {
          pct: 75,
          status: "On Track",
          ms: ["Design", "Build", "UAT", "Launch"],
          msSt: ["done", "done", "active", "pending"],
        },
        WR: {
          pct: 50,
          status: "On Track",
          ms: ["Design", "Build", "UAT", "Launch"],
          msSt: ["done", "active", "pending", "pending"],
        },
      },
    },
    {
      code: "RBP002",
      name: "Partner API Gateway",
      type: "Project",
      portfolioKey: "rb-p1",
      programmeKey: "rb-prog1",
      priority: "Medium",
      status: "Planning",
      due: "2027-01-31",
      budget: "KES 60M",
      subs: {
        HQ: {
          pct: 20,
          status: "Planning",
          ms: ["Design", "Build", "Certify", "Launch"],
          msSt: ["active", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "RBP003",
      name: "Finance ERP Migration",
      type: "Project",
      portfolioKey: "rb-p2",
      programmeKey: "rb-prog2",
      priority: "Critical",
      status: "At Risk",
      due: "2026-09-15",
      budget: "KES 150M",
      subs: {
        HQ: {
          pct: 40,
          status: "At Risk",
          ms: ["Discovery", "Design", "Migration", "UAT", "Cutover"],
          msSt: ["done", "active", "late", "pending", "pending"],
        },
        CR: {
          pct: 22,
          status: "At Risk",
          ms: ["Discovery", "Design", "Migration", "UAT", "Cutover"],
          msSt: ["done", "active", "pending", "pending", "pending"],
        },
      },
    },
    {
      code: "RBSP001",
      name: "Cyber Hygiene Audit",
      type: "Project",
      portfolioKey: null,
      programmeKey: null,
      priority: "Medium",
      status: "On Track",
      due: "2026-08-01",
      budget: "KES 20M",
      subs: {
        HQ: {
          pct: 60,
          status: "On Track",
          ms: ["Assessment", "Remediation", "Review"],
          msSt: ["done", "active", "pending"],
        },
      },
    },
  ],
  risks: [
    {
      title: "ERP migration cutover risk at Riverbank HQ",
      projectCode: "RBP003",
      category: "Technical",
      probability: 3,
      impact: 4,
      mitigation: "Add a rollback plan and an extra cutover rehearsal.",
      ownerEmail: "george.mutuku@example.invalid",
      status: "Open",
    },
  ],
  issues: [
    {
      title: "Partner API Gateway scope creep from late partner requirements",
      projectCode: "RBP002",
      severity: "Medium",
      ownerEmail: "farah.karanja@example.invalid",
      status: "Open",
    },
  ],
};

// ── Seeding machinery ─────────────────────────────────────────────────────────

async function resetTenant(slug: string) {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (!existing) return;

  await withTenant({ tenantId: existing.id, userId: "seed-script" }, async (tx) => {
    await tx.milestone.deleteMany({});
    await tx.projectOrgStatus.deleteMany({});
    await tx.issue.deleteMany({});
    await tx.risk.deleteMany({});
    await tx.project.deleteMany({});
    await tx.programme.deleteMany({});
    await tx.portfolio.deleteMany({});
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
      await tx.roleAssignment.create({
        data: { tenantId: tenant.id, userId: created.id, role: u.role },
      });
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
          type: proj.type,
          portfolioId: proj.portfolioKey ? (portfolioIdByKey.get(proj.portfolioKey) ?? null) : null,
          programmeId: proj.programmeKey ? (programmeIdByKey.get(proj.programmeKey) ?? null) : null,
          priority: proj.priority,
          status: mapStatus(proj.status),
          dueDate: proj.due ? new Date(proj.due) : null,
          budget: proj.budget,
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
          await tx.milestone.create({
            data: {
              tenantId: tenant.id,
              projectOrgStatusId: pos.id,
              name: sub.ms[i],
              sequence: i,
              state: sub.msSt[i],
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
        },
      });
    }
  });

  return tenant;
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
