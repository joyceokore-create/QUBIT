"use client";

import { Check, Circle } from "lucide-react";
import { passwordChecks } from "@/lib/password-rules";

/** Design spec v2 sign-in (`.pwreq`): a live checklist under the new-password field. Only the
 * length rule is required (D-F8); the rest show how to make the password stronger. */
export function PasswordChecklist({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <ul aria-label="Password requirements" className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 text-[12px] sm:grid-cols-2">
      {checks.map((c) => (
        <li key={c.key} className={`flex items-center gap-1.5 ${c.met ? "text-[var(--ds-ok-text)]" : "text-[var(--ds-ink3)]"}`}>
          {c.met ? <Check className="size-3.5 flex-none" aria-hidden /> : <Circle className="size-3.5 flex-none" aria-hidden />}
          <span>
            <span className="sr-only">{c.met ? "Met: " : "Not met: "}</span>
            {c.label}
            {!c.required && <span className="text-[var(--ds-ink3)]"> (stronger)</span>}
          </span>
        </li>
      ))}
      <li className="text-[var(--ds-ink3)] sm:col-span-2">Don&apos;t reuse a recent password.</li>
    </ul>
  );
}
