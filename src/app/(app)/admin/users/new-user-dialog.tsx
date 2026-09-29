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
import { ONBOARDING_ROLE_TIERS, type OnboardingRoleKey } from "@/lib/roles";
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
  canGrantSuperAdmin = false,
  sso = false,
}: {
  /** Accepted for call-site compatibility; org unit, team and project placement were
   *  removed from this form. */
  departments?: DeptOpt[];
  teams?: TeamOpt[];
  projects?: ProjectOpt[];
  /** Only a Super Admin may invite another Super Admin (mirrors the server guard, M-O1). */
  canGrantSuperAdmin?: boolean;
  /** SSO is configured — creating a user makes an active account they sign into with
   *  Microsoft; no invite link is issued. Drives the copy on this dialog. */
  sso?: boolean;
}) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"wizard" | "done">("wizard");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OnboardingRoleKey>("Member");
  // Declared dashboard views (docs/17 §1.3) — any number; the first is the one they land on.
  // Empty = decide from memberships (the derived half of docs/17 §1.1).
  const [declaredViews, setDeclaredViews] = useState<UserGroup[]>([]);
  const [copied, setCopied] = useState(false);
  // The create result. `sso` = active SSO account, no link. Otherwise (non-SSO) `acceptUrl`
  // is present only when email isn't configured — then the admin copies the link instead.
  const [created, setCreated] = useState<{ email: string; emailed: boolean; acceptUrl?: string; sso?: boolean } | null>(null);

  // Hide the "Administrator" tier (= PlatformSuperAdmin) from admins who can't grant it.
  const roleTiers = ONBOARDING_ROLE_TIERS.filter((t) => canGrantSuperAdmin || t.key !== "PlatformSuperAdmin");
  const roleTier = ONBOARDING_ROLE_TIERS.find((t) => t.key === role)!;
  // docs/26 §4.2 (M-P1d) — the role-and-scope preview: what this person will be ABLE to
  // do, said before the invite is sent, so admins invite deliberately.
  const SCOPE_LINE: Record<OnboardingRoleKey, string> = {
    PlatformSuperAdmin: "full administration — users, roles and settings",
    Executive: "reads everything; edits governance fields (stage/priority) and creates portfolios",
    HeadOfProjects: "governs delivery across every project — staffing, gates and cross-project reporting",
    ProjectManager: "creates projects and manages the ones they lead; raises staffing requests",
    Member: "works assigned tasks on their board and sends weekly updates",
  };
  // Live landing preview (docs/17 §1.3): the SAME resolver login uses — declared views
  // ∪ what this invite's role will derive — so the chip can't lie. The primary (landing)
  // view is the first one selected.
  const primaryView = declaredViews[0] ?? null;
  const landing = landingPersona(
    effectiveGroups(
      declaredViews,
      derivedGroups({ membershipCategories: [], tenantRoles: [role], leadsProjects: false }),
    ),
    primaryView,
    null,
  );
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Superadmin is a role, not a view (docs/17 §1) — it derives every view and lands on the
  // executive cockpit. Surfacing it as a "dashboard view" is a shortcut: selecting it sets
  // the PlatformSuperAdmin role and clears the declared views.
  const superadmin = role === "PlatformSuperAdmin";
  function handleSuperadmin(on: boolean) {
    if (on) {
      setRole("PlatformSuperAdmin");
      setDeclaredViews([]);
    } else {
      setRole("Member");
    }
  }
  const landingLabel = superadmin ? "Super admin" : GROUP_LABELS[landing];

  function reset() {
    setPhase("wizard");
    setStep(0);
    setName("");
    setEmail("");
    setRole("Member");
    setDeclaredViews([]);
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
        departmentId: null,
        teamId: null,
        projectId: null,
        projectRole: null,
        userGroups: declaredViews,
        primaryGroup: primaryView,
      },
      {
        fallback: "Could not create the user.",
        onSuccess: (data) => {
          const d = (data ?? {}) as { emailed?: boolean; acceptUrl?: string; sso?: boolean };
          setCreated({ email, emailed: Boolean(d.emailed), acceptUrl: d.acceptUrl, sso: Boolean(d.sso) });
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
        <Plus /> Create a user
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {phase === "wizard" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create a user</DialogTitle>
              <DialogDescription>
                {sso
                  ? "Three quick steps — once created, they sign in with Microsoft. No invite link."
                  : "Three quick steps — they set their own password from an emailed link."}
              </DialogDescription>
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
                  {/* Dashboard view(s) they land on — presentation only, never permission
                      (docs/17 §1.3). Multi-select: pick one or more; the first is the
                      default landing and they can switch between the rest. */}
                  <div className="rounded-[10px] border border-[var(--w08)] bg-[color-mix(in_oklab,var(--brand)_4%,transparent)] p-3">
                    <p className="text-[11.5px] font-semibold text-ink-2">Dashboard view</p>
                    <p className="mb-2 text-[11px] text-ink-3">Pick one or more views — they land on the first and can switch between the rest.</p>
                    <GroupPicker
                      multiple
                      values={declaredViews}
                      onValuesChange={setDeclaredViews}
                      allowSuperadmin={canGrantSuperAdmin}
                      superadmin={superadmin}
                      onSuperadminChange={handleSuperadmin}
                    />
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
                      Will land on:
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--brand)]">
                        {superadmin ? "Super admin — every dashboard" : `${landingLabel} dashboard`}
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
                    <Row label="Lands on" value={superadmin ? "Super admin — every dashboard" : `${landingLabel} dashboard`} />
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
                  <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create user"}</Button>
                )}
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                {created?.sso ? (
                  <>
                    <span className="font-medium text-ink-2">{created?.email}</span> can sign in now with Microsoft,
                    as long as they&apos;re in your organization&apos;s directory. No invite link is needed.
                  </>
                ) : created?.emailed ? (
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
              <Button type="button" variant="outline" onClick={reset}>Create another</Button>
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
