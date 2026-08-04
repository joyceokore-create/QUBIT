"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ONBOARDING_ROLE_TIERS, PROJECT_ROLES, projectRoleCategory, type OnboardingRoleKey } from "@/lib/roles";
import { derivedGroups, effectiveGroups, landingPersona, type UserGroup } from "@/lib/personas";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { GROUP_LABELS } from "@/components/admin/labels";
import { GroupPicker } from "./group-picker";

interface DeptOpt {
  id: string;
  name: string;
}
interface TeamOpt {
  id: string;
  name: string;
}
interface ProjectOpt {
  id: string;
  code: string;
  name: string;
}

const STEPS = ["Details", "Access", "Review"] as const;

export function NewUserDialog({
  departments = [],
  teams = [],
  projects = [],
  canGrantSuperAdmin = false,
}: {
  departments?: DeptOpt[];
  teams?: TeamOpt[];
  projects?: ProjectOpt[];
  /** Only a Super Admin may invite another Super Admin (mirrors the server guard, M-O1). */
  canGrantSuperAdmin?: boolean;
}) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"wizard" | "done">("wizard");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OnboardingRoleKey>("Member");
  const [departmentId, setDepartmentId] = useState("none");
  const [teamId, setTeamId] = useState("none");
  const [projectId, setProjectId] = useState("none");
  const [projectRole, setProjectRole] = useState<string>("Developer");
  // DM1.43: ONE declared group — exec, pm, or member(dev/qa/implementor). Null = decide
  // from memberships (the derived half of docs/17 §1.1).
  const [declaredGroup, setDeclaredGroup] = useState<UserGroup | null>(null);
  const [copied, setCopied] = useState(false);
  // M-O3: the invite result, not a password. `acceptUrl` is present only when email isn't
  // configured — then the admin copies the link instead of the mailer sending it.
  const [created, setCreated] = useState<{ email: string; emailed: boolean; acceptUrl?: string } | null>(null);

  // Hide the "Administrator" tier (= PlatformSuperAdmin) from admins who can't grant it.
  const roleTiers = ONBOARDING_ROLE_TIERS.filter((t) => canGrantSuperAdmin || t.key !== "PlatformSuperAdmin");
  const roleTier = ONBOARDING_ROLE_TIERS.find((t) => t.key === role)!;
  // docs/26 §4.2 (M-P1d) — the role-and-scope preview: what this person will be ABLE to
  // do, said before the invite is sent, so admins invite deliberately.
  const SCOPE_LINE: Record<OnboardingRoleKey, string> = {
    PlatformSuperAdmin: "full administration — users, roles and settings",
    Executive: "reads everything; edits governance fields (stage/priority) and creates portfolios",
    ProjectManager: "creates projects and manages the ones they lead; raises staffing requests",
    Member: "works assigned tasks on their board and sends weekly updates",
  };
  // Live landing preview (docs/17 §1.3): the SAME resolver login uses — declared groups
  // ∪ what this invite's role/placement will derive — so the chip can't lie.
  const landing = landingPersona(
    effectiveGroups(
      declaredGroup ? [declaredGroup] : [],
      derivedGroups({
        membershipCategories: projectId === "none" ? [] : [projectRoleCategory(projectRole)],
        tenantRoles: [role],
        leadsProjects: false,
      }),
    ),
    declaredGroup,
    null,
  );
  const deptName = departmentId === "none" ? "No org unit" : departments.find((d) => d.id === departmentId)?.name ?? "—";
  const teamName = teamId === "none" ? "—" : teams.find((t) => t.id === teamId)?.name ?? "—";
  const projName = projectId === "none" ? "—" : projects.find((p) => p.id === projectId)?.name ?? "—";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  function reset() {
    setPhase("wizard");
    setStep(0);
    setName("");
    setEmail("");
    setRole("Member");
    setDepartmentId("none");
    setTeamId("none");
    setProjectId("none");
    setProjectRole("Developer");
    setDeclaredGroup(null);
    setError(null);
    setCopied(false);
    setCreated(null);
  }

  function next() {
    setError(null);
    if (step === 0 && (!name.trim() || !emailValid)) {
      setError(!name.trim() ? "Enter a full name." : "Enter a valid work email.");
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await mutate(
      "/api/admin/users",
      "POST",
      {
        name,
        email,
        roles: [role],
        departmentId: departmentId === "none" ? null : departmentId,
        teamId: teamId === "none" ? null : teamId,
        projectId: projectId === "none" ? null : projectId,
        projectRole: projectId === "none" ? null : projectRole,
        userGroups: declaredGroup ? [declaredGroup] : [],
        primaryGroup: declaredGroup,
      },
      {
        fallback: "Could not create the user.",
        onSuccess: (data) => {
          const d = (data ?? {}) as { emailed?: boolean; acceptUrl?: string };
          setCreated({ email, emailed: Boolean(d.emailed), acceptUrl: d.acceptUrl });
          setPhase("done");
        },
      },
    );
  }

  async function copyLink() {
    if (!created?.acceptUrl) return;
    await navigator.clipboard.writeText(created.acceptUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog open={open} onOpenChange={(nx) => { setOpen(nx); if (!nx) reset(); }}>
      <DialogTrigger render={<Button />}>
        <Plus /> Invite user
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {phase === "wizard" ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite a user</DialogTitle>
              <DialogDescription>Three quick steps — they set their own password from an emailed link.</DialogDescription>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {STEPS.map((label, i) => (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <span
                    className="flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      background: i <= step ? "var(--brand)" : "var(--w06)",
                      color: i <= step ? "var(--onbrand)" : "var(--ink4)",
                    }}
                  >
                    {i < step ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: i === step ? "var(--qink)" : "var(--ink4)" }}>{label}</span>
                  {i < STEPS.length - 1 && <span className="h-px flex-1" style={{ background: "var(--w08)" }} />}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-4" noValidate>
              {step === 0 && (
                <>
                  <Field label="Full name" htmlFor="nu-name">
                    <Input id="nu-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
                  </Field>
                  <Field label="Work email" htmlFor="nu-email">
                    <Input id="nu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
                    <p className="text-xs text-ink-3">Their email domain routes them to this organization at sign-in.</p>
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink-2">Role</span>
                    <div className="grid gap-2">
                      {roleTiers.map((t) => {
                        const active = role === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setRole(t.key)}
                            className="flex items-start gap-2.5 rounded-[10px] border p-2.5 text-left transition-colors"
                            style={{ borderColor: active ? "var(--brand)" : "var(--w10)", background: active ? "color-mix(in oklab, var(--brand) 8%, transparent)" : "transparent" }}
                          >
                            <span className="mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border" style={{ borderColor: active ? "var(--brand)" : "var(--w18)" }}>
                              {active && <span className="size-2 rounded-full bg-[var(--brand)]" />}
                            </span>
                            <span>
                              <span className="block text-[13px] font-semibold text-foreground">{t.label}</span>
                              <span className="block text-[11.5px] text-ink-3">{t.desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {departments.length > 0 && (
                    <Field label="Org unit (optional)" htmlFor="nu-dept">
                      <Select
                        value={departmentId}
                        onValueChange={(v) => setDepartmentId(v ?? "none")}
                        items={{ none: "No org unit", ...Object.fromEntries(departments.map((d) => [d.id, d.name])) }}
                      >
                        <SelectTrigger id="nu-dept"><SelectValue placeholder="No org unit" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No org unit</SelectItem>
                          {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <div className="rounded-[10px] border border-[var(--w08)] bg-[color-mix(in_oklab,var(--brand)_4%,transparent)] p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-ink-2">Place them on day one (optional)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={teamId}
                        onValueChange={(v) => setTeamId(v ?? "none")}
                        items={{ none: "No team", ...Object.fromEntries(teams.map((t) => [t.id, t.name])) }}
                      >
                        <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No team</SelectItem>
                          {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select
                        value={projectId}
                        onValueChange={(v) => setProjectId(v ?? "none")}
                        items={{ none: "No project", ...Object.fromEntries(projects.map((p) => [p.id, `${p.name} (${p.code})`])) }}
                      >
                        <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No project</SelectItem>
                          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {projectId !== "none" && (
                      <div className="mt-2">
                        <Select value={projectRole} onValueChange={(v) => v && setProjectRole(v)}>
                          <SelectTrigger><SelectValue placeholder="Project role" /></SelectTrigger>
                          <SelectContent>
                            {PROJECT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Dashboard group (docs/17 §1.3, single-choice per DM1.43) —
                      presentation only, never permission. */}
                  <div className="rounded-[10px] border border-[var(--w08)] p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-ink-2">Dashboard group</p>
                    <GroupPicker value={declaredGroup} onChange={setDeclaredGroup} />
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
                      Will land on:
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--brand)]">
                        {GROUP_LABELS[landing]} dashboard
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-ink-3">Scope: {SCOPE_LINE[role]}.</p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="rounded-[10px] border border-ink-4 bg-background p-3 text-sm">
                    <Row label="Name" value={name} />
                    <Row label="Email" value={email} />
                    <Row label="Role" value={roleTier.label} />
                    <Row label="Org unit" value={deptName} />
                    <Row label="Team" value={teamName} />
                    <Row label="Project" value={projectId === "none" ? "—" : `${projName} · ${projectRole}`} />
                    <Row label="Lands on" value={`${GROUP_LABELS[landing]} dashboard`} />
                    <Row label="Can" value={SCOPE_LINE[role]} />
                  </div>
                  <p className="text-xs text-ink-3">
                    They&apos;ll get an email with a one-time link to set their own password. No
                    temporary password is created.
                  </p>
                </>
              )}

              {error && <p role="alert" className="text-sm text-status-red">{error}</p>}

              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" disabled={step === 0} onClick={() => { setError(null); setStep((s) => Math.max(0, s - 1)); }}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={next}>Next <ArrowRight className="size-4" /></Button>
                ) : (
                  <Button type="submit" disabled={busy}>{busy ? "Inviting…" : "Send invite"}</Button>
                )}
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>User invited</DialogTitle>
              <DialogDescription>
                {created?.emailed ? (
                  <>
                    An invite email is on its way to{" "}
                    <span className="font-medium text-ink-2">{created?.email}</span>. The link expires in 72 hours.
                  </>
                ) : (
                  <>
                    Email isn&apos;t configured on this deployment, so send{" "}
                    <span className="font-medium text-ink-2">{created?.email}</span> this one-time link yourself. It
                    expires in 72 hours and works once.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {created?.acceptUrl && (
              <div className="flex items-center gap-2 rounded-[10px] border border-ink-4 bg-background p-3">
                <code className="flex-1 truncate font-mono text-xs text-foreground">{created.acceptUrl}</code>
                <Button type="button" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="size-4 text-status-green" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={reset}>Invite another</Button>
              <Button type="button" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-background py-1.5 last:border-0">
      <span className="text-ink-4">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
    </div>
  );
}
