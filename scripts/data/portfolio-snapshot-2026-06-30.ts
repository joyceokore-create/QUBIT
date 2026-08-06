/**
 * Riverbank delivery snapshot — transcribed from the 30 June 2026 status decks
 * (AI Initiatives Portfolio · ZED ERP · Swipe Agent Banking). Loaded by
 * scripts/load-portfolio.ts, which is idempotent and keyed on project CODE.
 *
 * NO PII: this file holds project/market facts only. Where the decks named individual
 * staff in a blocker note ("needs X/Y assignment"), the note is kept but the names are
 * dropped — CLAUDE.md rule 3 keeps real people out of committed data. People arrive
 * separately via the CSV import, which is never committed.
 *
 * TWO TRANSCRIPTION NOTES worth knowing before trusting a number:
 *   1. The ✗ glyph means DIFFERENT things on different decks. On the AI Initiatives deck
 *      its legend reads "Blocked"; on the ZED ERP deck its legend reads "Not Started".
 *      Each project below is transcribed against ITS OWN deck's legend.
 *   2. The decks print a % per row. QUBIT DERIVES % from gate state and never stores a
 *      typed one (docs/18 — "% is derived, never typed"), so the deck's figure is carried
 *      in `statedPct` for the record and written into the status note, NOT into progress.
 *      Where the two disagree the gates are the source of truth. Divergences are listed
 *      in the loader's summary output.
 */

/** Gate state, using the model's vocabulary (CheckpointStatus.state). */
export type Gate = "Done" | "InProgress" | "NotStarted" | "Blocked";

/** Deck glyph → model state, per the AI Initiatives legend. `!` (Delayed) has no model
 * equivalent — it lands as InProgress and the delay is spelled out in the note. */
export const AI_DECK_GLYPH: Record<string, Gate> = {
  "✓": "Done",
  "●": "InProgress",
  "!": "InProgress", // "Delayed" — no such state; the note carries it
  "✗": "Blocked",
  "—": "NotStarted",
};

/** ZED/Swipe legend: ✗ means NOT STARTED there, not blocked. */
export const ROLLOUT_DECK_GLYPH: Record<string, Gate> = {
  "✓": "Done",
  "◐": "InProgress",
  "✗": "NotStarted",
  "—": "NotStarted",
};

export interface PipelineProject {
  code: string;
  name: string;
  description: string;
  priority: "High" | "Med" | "Low" | "New" | "Strat" | "Paused";
  stage: "Approved" | "Evaluating" | "Exploring" | "Paused";
  /** BRD · Prototype · MVP1 · SIT · UAT · Go-Live, in template order. */
  gates: Gate[];
  statedPct: number;
  note: string;
}

export const PRODUCT_BUILD_GATES = ["BRD", "Prototype", "MVP1", "SIT", "UAT", "Go-Live"] as const;

/** Deck 1 — "AI Initiatives Portfolio | Build Pipeline Status", 30 June 2026. */
export const PIPELINE: PipelineProject[] = [
  // ── APPROVED — business case approved, now a project ────────────────────────
  { code: "FIKRA", name: "Fikra", description: "Group staff innovation hub", priority: "Low", stage: "Approved",
    gates: ["Done", "Done", "Done", "Done", "Done", "InProgress"], statedPct: 70, note: "SIT ongoing." },
  { code: "SIFA", name: "Sifa", description: "Faith-based membership & giving", priority: "Med", stage: "Approved",
    gates: ["Done", "Done", "Done", "Done", "Done", "Done"], statedPct: 100, note: "Business sanity before pilot rollout." },
  { code: "CHECK", name: "Checksmart", description: "Biometric benefit disbursement", priority: "High", stage: "Approved",
    gates: ["Done", "Done", "Done", "InProgress", "NotStarted", "NotStarted"], statedPct: 80, note: "Pilot deployment." },
  { code: "ASSETV", name: "Asset Valuation", description: "Property collateral management", priority: "Med", stage: "Approved",
    gates: ["Done", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 50, note: "Deployment ongoing." },
  { code: "NEXAI", name: "Nex-AI", description: "Group-wide AI enablement", priority: "Low", stage: "Approved",
    gates: ["Done", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 90, note: "SCORM content complete; financial negotiation ongoing." },
  { code: "HOMEQ", name: "HomeQuest", description: "Rent collection & property workflows", priority: "Med", stage: "Approved",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 50, note: "SIT ongoing." },
  { code: "KEZA", name: "Keza", description: "MSME AI-investment platform", priority: "High", stage: "Approved",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 10, note: "BRD finalisation." },
  { code: "CURIS", name: "Curis", description: "Digital medical scheme administration", priority: "Med", stage: "Approved",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 20, note: "Requirements aligned; build ongoing." },
  { code: "SAFIRI", name: "ZED-SAFIRI", description: "Transport SACCO payments", priority: "New", stage: "Approved",
    gates: ["Done", "Done", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 10, note: "Awaiting BRD finalisation." },

  // ── EVALUATING — idea validation, business case development ─────────────────
  { code: "LUMI", name: "Lumi", description: "AI knowledge layer", priority: "High", stage: "Evaluating",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 8, note: "Business case preparation." },
  { code: "QORA", name: "Qora", description: "AI credit document parsing", priority: "High", stage: "Evaluating",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 8, note: "FBP working on the financial model." },
  { code: "TALIN", name: "Talin", description: "Intelligent recruitment platform", priority: "New", stage: "Evaluating",
    gates: ["NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0,
    note: "Newly added to the evaluation queue. Development ongoing but tracked under Anchor." },
  { code: "TRAMIA", name: "Tramia", description: "Virtual assets & tokenisation", priority: "Strat", stage: "Evaluating",
    gates: ["InProgress", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0,
    note: "BRD DELAYED. Financial model unrealistic at CAPEX=0." },
  { code: "RETAIL", name: "RetailFlow", description: "Point of commerce retail", priority: "High", stage: "Evaluating",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0,
    note: "BRD DELAYED. Reconsidering; may be re-scoped." },
  { code: "QUBIT", name: "Qubit", description: "Enterprise project tracking", priority: "Low", stage: "Evaluating",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0,
    note: "BRD DELAYED. Business case returned; budget justification needed." },

  // ── EXPLORING — raw ideas, no commitment yet ───────────────────────────────
  { code: "TRAVIRA", name: "Travira", description: "School travel marketplace", priority: "Med", stage: "Exploring",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 8, note: "Best-fit business owner discussion." },
  { code: "EDULIFT", name: "EduLift", description: "HELB — education loan disbursements", priority: "Med", stage: "Exploring",
    gates: ["InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 8, note: "Alignment on scope planned." },
  { code: "ANCHOR", name: "Anchor ERP", description: "AI-native Oracle replacement", priority: "Paused", stage: "Paused",
    gates: ["Blocked", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0,
    note: "BRD BLOCKED — a new direction is being pursued." },
  { code: "TURNQ", name: "Turnquest replacement", description: "Treasury system replacement", priority: "New", stage: "Exploring",
    gates: ["NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 0, note: "Idea stage; no commitment." },
  { code: "ONEVIEW", name: "One-View", description: "Customer identity & MDM", priority: "New", stage: "Exploring",
    gates: ["Done", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"], statedPct: 33, note: "Prototype in progress." },
];

export interface MarketProject {
  /** OrgUnit.code of the market this implementation serves. */
  market: string;
  /** Market name as the deck prints it, for the project name. */
  marketName: string;
  gates: Gate[];
  /** The deck's own figure where it prints one; null where it does not (Swipe prints
   * none, so its % is derived from the channel states rather than invented). */
  statedPct: number | null;
  /** Deck 3 / deck 5 focus & blocker text, individual names removed. */
  note: string;
}

export interface RolloutPortfolio {
  name: string;
  description: string;
  /** Project code prefix — the market code is appended (ZED-KE, SWIPE-KE …). */
  codePrefix: string;
  /** Checkpoint template driving this portfolio's columns. */
  template: string;
  gateNames: readonly string[];
  priority: "High" | "Med" | "Low" | "New" | "Strat" | "Paused";
  projects: MarketProject[];
}

export const MARKET_ROLLOUT_GATES = [
  "Business Case", "Contract", "Solution Build", "Bank Integration",
  "Telco Integration", "Testing", "GTM/Pilot", "Rollout",
] as const;

/** Deck 4/5's channel columns are not delivery gates, so they need their own template. */
export const AGENT_CHANNEL_GATES = ["POS", "HAL SLA/Ops", "USSD", "Agent Portal", "Mobile App"] as const;

/**
 * Decks 2–3 (ZED ERP) and 4–5 (Swipe Agent Banking) are PORTFOLIOS. Each deck row is a
 * MARKET IMPLEMENTATION, which is the unit the business actually tracks, staffs and
 * reports on (deck 3 phases them as "KCB Kenya", "KCB Tanzania" …) — so each row becomes
 * a project inside its portfolio, and the deck's columns become that project's gates.
 */
export const ROLLOUT_PORTFOLIOS: RolloutPortfolio[] = [
  {
    name: "ZED ERP",
    description: "Core banking / ERP taken market by market. Overall completion 54.6% (deck 30 Jun 2026); live markets KE and TZ (pilot).",
    codePrefix: "ZED",
    template: "Market rollout",
    gateNames: MARKET_ROLLOUT_GATES,
    priority: "High",
    projects: [
      { market: "KE", marketName: "Kenya", statedPct: 98,
        gates: ["Done", "Done", "Done", "Done", "Done", "Done", "InProgress", "NotStarted"],
        note: "Phase 1 — live. SOPs are the ONLY remaining blocker; UATs for revenue splits ongoing and compliance risk review pending before sign-off." },
      { market: "TZ", marketName: "Tanzania", statedPct: 77,
        gates: ["Done", "Done", "Done", "Done", "InProgress", "Done", "InProgress", "NotStarted"],
        note: "Phase 1 — live (pilot). Card & funds-transfer integrations not started. One mobile-money integration blocked on a new VPN; another awaiting test cases. RCSA, DPIA, pilot strategy and GTM in progress." },
      { market: "UG", marketName: "Uganda", statedPct: 62,
        gates: ["Done", "Done", "Done", "InProgress", "Done", "InProgress", "NotStarted", "NotStarted"],
        note: "Phase 2 — testing. Teller & agency banking in UAT. Card not started; no MBP in this market. All CAB readiness items (SOPs, RCSA, DPIA, pilot, GTM) not started — needs owner assignment." },
      { market: "RW", marketName: "Rwanda", statedPct: 47,
        gates: ["Done", "InProgress", "Done", "InProgress", "InProgress", "InProgress", "NotStarted", "NotStarted"],
        note: "Phase 3 — pipeline. Contract still with the market, awaiting their revert. Mobile money blocked awaiting RNDPS API documentation. Card, FT and MBP not started." },
      { market: "BI", marketName: "Burundi", statedPct: 25,
        gates: ["NotStarted", "NotStarted", "Done", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"],
        note: "Phase 3 — pipeline. Newly assigned owner re-engaging; conversations restarting. Business case & contract not started. All mobile-money and CAB items not started." },
      { market: "SS", marketName: "South Sudan", statedPct: 21,
        gates: ["InProgress", "NotStarted", "Done", "InProgress", "NotStarted", "NotStarted", "NotStarted", "NotStarted"],
        note: "Phase 3 — pipeline. Effectively STALLED: contract not started and no resource for SITs. Needs escalation to re-engage the market team." },
      { market: "DRC", marketName: "DR Congo", statedPct: 0,
        gates: ["NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted", "NotStarted"],
        note: "Phase 3 — pipeline. TBA; no commitment yet." },
    ],
  },
  {
    name: "Swipe Agent Banking",
    description: "Agent banking channels market by market — POS, HAL SLA/Ops, USSD, agent portal, mobile app. Overall RAG green (deck 21 May 2026).",
    codePrefix: "SWIPE",
    template: "Agent banking channels",
    gateNames: AGENT_CHANNEL_GATES,
    priority: "High",
    projects: [
      // The deck prints no % for Swipe, so statedPct is null and the figure is derived
      // from the channel states — inventing one would be worse than deriving it.
      { market: "KE", marketName: "Kenya", statedPct: null,
        gates: ["Done", "Done", "Done", "Done", "InProgress"],
        note: "7,180 terminals. Focus: close UAT for agent portal & mobile app — 93% pass rate on the portal; domain connection issue resolved." },
      { market: "TZ", marketName: "Tanzania", statedPct: null,
        gates: ["Done", "Done", "InProgress", "InProgress", "InProgress"],
        note: "1,250 terminals. POS and HAL ops live. Focus: finalise agent portal, USSD and mobile app UAT." },
      { market: "UG", marketName: "Uganda", statedPct: null,
        gates: ["Done", "Done", "InProgress", "Done", "InProgress"],
        note: "450 terminals. Already in production. Finalise APN configuration with the telco (SIM dependency for production rollout); prepare to pilot and scale POS terminals." },
      { market: "RW", marketName: "Rwanda", statedPct: null,
        gates: ["InProgress", "InProgress", "NotStarted", "InProgress", "NotStarted"],
        note: "Still on the legacy backend. Needs approval & testing of the new consolidated backend; focus on Phoenix T24 endpoints and GH2H integrations." },
      { market: "BI", marketName: "Burundi", statedPct: null,
        gates: ["Done", "Done", "InProgress", "InProgress", "InProgress"],
        note: "120 terminals. POS promoted to production. Deploy & roll out Cash by Code; finalise USSD, agent portal & mobile app UAT." },
      { market: "SS", marketName: "South Sudan", statedPct: null,
        gates: ["Done", "Done", "InProgress", "InProgress", "InProgress"],
        note: "Dual-currency pilot. BLOCKER: domain connection endpoints for POS & mobile app pending a security/network team unblock. All channels still in testing." },
    ],
  },
];

/** The pipeline portfolio. ZED ERP and Swipe Agent Banking are portfolios in their own
 * right (see ROLLOUT_PORTFOLIOS) and the loader creates them from that list. */
export const PORTFOLIOS = [
  { name: "AI Initiatives", viewKind: "Pipeline", description: "Product delivery lifecycle — idea through go-live (deck 1)." },
] as const;
