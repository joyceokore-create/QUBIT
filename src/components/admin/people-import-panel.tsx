"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD } from "@/lib/surface";

/**
 * Bulk onboarding from the CSV template (DM1.72; Oct 2026 — template download, file
 * upload, a dry-run preview, and each person's projects). The org-setup wizard is retired
 * — QUBIT serves one tenant whose brand and structure are settled — but onboarding a batch
 * of people stays a recurring job, so it lives here.
 *
 * Under SSO every row becomes an active account that signs in with Microsoft; without SSO
 * each row mints its own one-time invite and the links come back for the admin to
 * distribute. No password is ever generated or shown. The file is re-runnable: a person
 * who already exists is updated (projects applied), never failed.
 */

interface RowResult {
  email: string;
  status: "invited" | "active" | "updated" | "error";
  message?: string;
  acceptUrl?: string;
  assigned: string[];
  leadOf: string[];
  unknownProjects: string[];
}
interface RowPreview {
  line: number;
  name: string;
  email: string;
  role: string;
  exists: boolean;
  projectsFound: string[];
  unknownProjects: string[];
}
interface RowError {
  line: number;
  message: string;
}

const STATUS_LABEL: Record<RowResult["status"], string> = { invited: "invited", active: "active", updated: "updated", error: "error" };
const PLACEHOLDER = `name,email,role,projects,group
user_001,user_001@example.invalid,ProjectManager,KEZA;SWIPE-KE,`;

export function PeopleImportPanel() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RowPreview[] | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function call(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    const res = await fetch(`/api/admin/people-import${dryRun ? "?dryRun=1" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(null);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? "Import failed.");
      return;
    }
    setRowErrors(json.data.errors as RowError[]);
    if (dryRun) {
      setPreview(json.data.preview as RowPreview[]);
      setResults(null);
    } else {
      setResults(json.data.results as RowResult[]);
      setPreview(null);
    }
  }

  function readFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setFileName(file.name);
      setPreview(null);
      setResults(null);
    };
    reader.readAsText(file);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Upload className="size-3.5" /> Import people (CSV)
        </Button>
        <a href="/api/admin/people-import/template" download className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink3)] hover:text-brand">
          <Download className="size-3.5" aria-hidden /> Download template
        </a>
      </div>
    );
  }

  const canRun = csv.trim().length > 0 && busy === null;

  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`} style={{ background: "var(--cardbg)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-bold text-[var(--qink)]">Import people</h2>
        <a href="/api/admin/people-import/template" download className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">
          <Download className="size-3.5" aria-hidden /> Download template
        </a>
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">
          <Upload className="size-3.5" aria-hidden /> {fileName ? `Replace ${fileName}` : "Choose file"}
        </button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label="People CSV file" onChange={(e) => readFile(e.target.files?.[0])} />
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[11.5px] text-[var(--ink4)] hover:text-[var(--qink)]">
          Close
        </button>
      </div>
      <p className="text-[11.5px] text-[var(--ink3)]">
        One row per person, five columns: <code className="font-mono text-[10.5px]">name, email, role, projects, group</code>. <b>role</b> is one of
        PlatformSuperAdmin · HeadOfProjects · Executive · ProjectManager · Member (blank = Member). <b>projects</b> are project codes separated by
        <code className="font-mono text-[10.5px]"> ; </code>(e.g. KEZA;SWIPE-KE) — a project manager becomes the lead of any of them that has none. <b>group</b> can
        stay blank. People who already exist are updated, not skipped; a bad row is reported and never aborts the batch.
      </p>
      <textarea
        rows={7}
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setPreview(null);
          setResults(null);
        }}
        placeholder={PLACEHOLDER}
        aria-label="People CSV"
        className="w-full rounded-lg border border-input bg-background p-2.5 font-mono text-[11.5px]"
      />
      {error && (
        <p role="alert" className="text-[11.5px] text-[var(--bad)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={!canRun} onClick={() => void call(true)}>
          {busy === "preview" ? "Checking…" : "Preview"}
        </Button>
        <Button type="button" disabled={!canRun || !preview} onClick={() => void call(false)} title={preview ? undefined : "Preview first"}>
          {busy === "import" ? "Importing…" : preview ? `Import ${preview.length} ${preview.length === 1 ? "person" : "people"}` : "Import"}
        </Button>
        {!preview && !results && <span className="text-[11px] text-[var(--ink5)]">Preview checks every row and project code before anything is written.</span>}
      </div>

      {rowErrors.length > 0 && (
        <div className="rounded-[8px] p-2.5 text-[11.5px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
          {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} will be skipped:
          <ul className="mt-1 flex flex-col gap-0.5">
            {rowErrors.map((e) => (
              <li key={e.line}>
                line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="overflow-x-auto rounded-[10px] border border-[var(--w08)]">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                <th className="border-b border-[var(--hair)] px-3 py-2">Line</th>
                <th className="border-b border-[var(--hair)] px-3 py-2">Person</th>
                <th className="border-b border-[var(--hair)] px-3 py-2">Role</th>
                <th className="border-b border-[var(--hair)] px-3 py-2">Projects</th>
                <th className="border-b border-[var(--hair)] px-3 py-2">Will</th>
              </tr>
            </thead>
            <tbody>
              {preview.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-[var(--ink5)]">
                    No importable rows.
                  </td>
                </tr>
              )}
              {preview.map((p) => (
                <tr key={p.line} className="border-b border-[var(--hair2)] last:border-0">
                  <td className="px-3 py-2 font-mono text-[10.5px] text-[var(--ink4)]">{p.line}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--qink)]">{p.name}</span>
                    <span className="text-[var(--ink4)]"> · {p.email}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--ink2)]">{p.role}</td>
                  <td className="px-3 py-2">
                    {p.projectsFound.map((c) => (
                      <span key={c} className="mr-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
                        ✓ {c}
                      </span>
                    ))}
                    {p.unknownProjects.map((c) => (
                      <span key={c} className="mr-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 10%, transparent)" }} title="No project with this code">
                        ✗ {c}
                      </span>
                    ))}
                    {p.projectsFound.length + p.unknownProjects.length === 0 && <span className="text-[var(--ink5)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--ink3)]">{p.exists ? "update (already exists)" : "create"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
            {results.filter((r) => r.status !== "error").length} of {results.length} imported
          </div>
          {results.map((r) => (
            <div key={r.email} className="flex flex-wrap items-center gap-2 border-b border-[var(--hair2)] py-1.5 text-[11.5px] last:border-0">
              <span className="min-w-0 flex-1 truncate text-[var(--ink2)]">{r.email}</span>
              <span className="font-mono text-[9px] font-bold uppercase" style={{ color: r.status === "error" ? "var(--bad)" : "var(--ok)" }}>
                {STATUS_LABEL[r.status]}
              </span>
              {r.assigned.length > 0 && (
                <span className="text-[11px] text-[var(--ink3)]">
                  → {r.assigned.join(", ")}
                  {r.leadOf.length > 0 && <span className="text-[var(--ink4)]"> (lead of {r.leadOf.join(", ")})</span>}
                </span>
              )}
              {r.unknownProjects.length > 0 && <span className="text-[11px] text-[var(--warn)]">unknown code{r.unknownProjects.length === 1 ? "" : "s"}: {r.unknownProjects.join(", ")}</span>}
              {r.message && <span className="text-[11px] text-[var(--bad)]">{r.message}</span>}
              {r.acceptUrl && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(r.acceptUrl!).catch(() => {})}
                  className="rounded-[6px] border border-[var(--w07)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
                >
                  Copy invite link
                </button>
              )}
            </div>
          ))}
          {results.some((r) => r.acceptUrl) && (
            <p className="mt-1 text-[10.5px] text-[var(--ink4)]">Email is not configured, so no invitations were sent — copy each link and pass it on. They expire in 72 hours.</p>
          )}
        </div>
      )}
    </section>
  );
}
