"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD } from "@/lib/surface";

/**
 * Bulk invite from a CSV (DM1.72). The org-setup wizard is retired — QUBIT serves one
 * tenant whose brand and structure are settled — but importing a batch of people from an
 * HR or YouTrack export is a recurring job, so that one step moved here.
 *
 * Every row mints its own one-time invite. While email is unconfigured the accept links
 * come back for the admin to distribute; no password is ever generated or shown.
 */

interface RowResult {
  email: string;
  status: "invited" | "error";
  message?: string;
  acceptUrl?: string;
}
interface RowError {
  line: number;
  message: string;
}

const PLACEHOLDER = `name,email,role,group
Asha Otieno,asha.otieno@riverbank.solutions,ProjectManager,pm
Test Dev,test.dev@riverbank.solutions,Member,developer`;

export function PeopleImportPanel() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/people-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? "Import failed.");
      return;
    }
    setResults(json.data.results as RowResult[]);
    setRowErrors(json.data.errors as RowError[]);
  }

  if (!open) {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Upload className="size-3.5" /> Import people (CSV)
        </Button>
      </div>
    );
  }

  return (
    <section className={`${CARD} flex flex-col gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-bold text-[var(--qink)]">Import people</h2>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[11.5px] text-[var(--ink4)] hover:text-[var(--qink)]">
          Close
        </button>
      </div>
      <p className="text-[11.5px] text-[var(--ink3)]">
        One row per person: <code className="font-mono text-[10.5px]">name,email,role,group</code>. Role is one of
        PlatformSuperAdmin · HeadOfProjects · HeadOfQA · Executive · ProjectManager · Member; group is executive · pm ·
        developer · qa · implementor. A bad row is reported and skipped — it never aborts the batch.
      </p>
      <textarea
        rows={8}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="People CSV"
        className="w-full rounded-lg border border-input bg-background p-2.5 font-mono text-[11.5px]"
      />
      {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}
      <div>
        <Button type="button" disabled={busy || !csv.trim()} onClick={() => void run()}>
          {busy ? "Inviting…" : "Invite everyone in this list"}
        </Button>
      </div>

      {rowErrors.length > 0 && (
        <div className="rounded-[8px] p-2.5 text-[11.5px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
          {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} skipped:
          <ul className="mt-1 flex flex-col gap-0.5">
            {rowErrors.map((e) => (
              <li key={e.line}>line {e.line}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
            {results.filter((r) => r.status === "invited").length} invited
          </div>
          {results.map((r) => (
            <div key={r.email} className="flex flex-wrap items-center gap-2 border-b border-[var(--hair2)] py-1.5 text-[11.5px] last:border-0">
              <span className="min-w-0 flex-1 truncate text-[var(--ink2)]">{r.email}</span>
              {r.status === "invited" ? (
                <>
                  <span className="font-mono text-[9px] font-bold uppercase" style={{ color: "var(--ok)" }}>invited</span>
                  {r.acceptUrl && (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(r.acceptUrl!).catch(() => {})}
                      className="rounded-[6px] border border-[var(--w07)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
                    >
                      Copy invite link
                    </button>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-[var(--bad)]">{r.message}</span>
              )}
            </div>
          ))}
          {results.some((r) => r.acceptUrl) && (
            <p className="mt-1 text-[10.5px] text-[var(--ink4)]">
              Email is not configured, so no invitations were sent — copy each link and pass it on. They expire in 72 hours.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
