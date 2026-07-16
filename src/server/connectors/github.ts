/**
 * GitHub connector — reads repo signals with a fine-grained PAT (Contents/PRs/Issues: read).
 * Pure `summarizeGithub` (testable) + `fetchGithubSummary` (live REST; returns null on any
 * error so the workspace degrades gracefully). No new dependency — native fetch.
 */
import type { IntegrationSummary } from "@/server/connectors/types";

interface Commit {
  commit?: { message?: string; author?: { name?: string; date?: string } };
}
interface Issue {
  pull_request?: unknown;
}

function relDate(iso?: string): string {
  if (!iso) return "recently";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Build the normalized summary from raw GitHub payloads (pure — unit-tested). */
export function summarizeGithub(
  repo: string,
  commits: Commit[],
  openPulls: unknown[],
  issues: Issue[],
  closedIssues: Issue[],
): IntegrationSummary {
  const last = commits[0]?.commit;
  const openIssues = issues.filter((i) => !i.pull_request).length;
  const fixed = closedIssues.filter((i) => !i.pull_request).length;
  const prCount = openPulls.length >= 100 ? "100+" : String(openPulls.length);
  const firstLine = (last?.message ?? "").split("\n")[0].slice(0, 100);

  return {
    headline: `${repo} · ${prCount} open PRs`,
    lines: [
      last ? `Last commit: "${firstLine}" — ${last.author?.name ?? "unknown"}, ${relDate(last.author?.date)}` : "No commits found.",
      `Open pull requests: ${prCount}`,
      `Issues: ${openIssues} open (not yet fixed), ${fixed} closed (fixed) in the last 30 days`,
    ],
  };
}

const API = "https://api.github.com";

export async function fetchGithubSummary(token: string, resource: string): Promise<IntegrationSummary | null> {
  const repo = resource.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "qubit-app",
  };
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  try {
    const [commitsR, pullsR, openR, closedR] = await Promise.all([
      fetch(`${API}/repos/${repo}/commits?per_page=1`, { headers }),
      fetch(`${API}/repos/${repo}/pulls?state=open&per_page=100`, { headers }),
      fetch(`${API}/repos/${repo}/issues?state=open&per_page=100`, { headers }),
      fetch(`${API}/repos/${repo}/issues?state=closed&per_page=100&since=${since}`, { headers }),
    ]);
    if (!commitsR.ok || !pullsR.ok || !openR.ok || !closedR.ok) return null;
    const [commits, pulls, open, closed] = await Promise.all([
      commitsR.json(),
      pullsR.json(),
      openR.json(),
      closedR.json(),
    ]);
    return summarizeGithub(repo, commits, pulls, open, closed);
  } catch {
    return null;
  }
}
