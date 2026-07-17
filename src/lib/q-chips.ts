// Role-aware Q suggestion chips (PROMPT §7). Pure — the Q drawer renders these as one-tap
// prompts into the agentic chat. Highest-priority role wins for multi-role users.

export interface QChip {
  label: string;
  prompt: string;
}

export function qSuggestionChips(roles: string[]): QChip[] {
  const has = (r: string) => roles.includes(r);

  if (has("PlatformSuperAdmin")) {
    return [
      { label: "Platform health", prompt: "Give me a platform health summary — users, MFA adoption, and anything that needs attention." },
      { label: "Portfolio brief", prompt: "Give me a portfolio brief — what's at risk and what needs attention." },
    ];
  }
  if (has("HeadOfProjects")) {
    return [
      { label: "Projects needing attention", prompt: "Which projects need attention, and which have no lead?" },
      { label: "PM workload", prompt: "Who is over-allocated across the projects?" },
    ];
  }
  if (has("HeadOfQA")) {
    return [
      { label: "What's stuck in testing?", prompt: "What's stuck in testing or UAT right now?" },
      { label: "Open issues by severity", prompt: "Show me the open issues by severity." },
    ];
  }
  if (has("Executive")) {
    return [
      { label: "Portfolio brief", prompt: "Give me a portfolio brief — health, projects at risk, and critical blockers." },
      { label: "Milestone slippage", prompt: "Which milestones are slipping?" },
    ];
  }
  if (has("ProjectManager")) {
    return [
      { label: "Status of my projects", prompt: "What's the status of my projects?" },
      { label: "My risks & blockers", prompt: "What open risks and blockers are on my projects?" },
    ];
  }
  // Member (default).
  return [
    { label: "What's my week look like?", prompt: "What does my week look like — my tasks and anything blocking me?" },
    { label: "My open tasks", prompt: "What are my open and overdue tasks?" },
  ];
}
