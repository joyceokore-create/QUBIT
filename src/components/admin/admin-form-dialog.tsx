"use client";

import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The shared admin form dialog (docs/21 M-O2b). It owns the chrome every admin dialog
 * repeats — title/description, the `role="alert"` error slot fed by
 * `useAdminMutation().error`, and the Cancel + submit footer with its busy label — and
 * nothing else. Fields stay with the caller as `children`, because they are the part that
 * genuinely differs; this wrapper exists so the shell can't drift screen to screen.
 *
 * Markup matches the existing user/department dialogs exactly — consolidation, not a restyle.
 */
export function AdminFormDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  busy = false,
  submitLabel = "Save",
  busyLabel,
  onSubmit,
  children,
  className,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** From useAdminMutation(); rendered in the standard alert slot when set. */
  error?: string | null;
  busy?: boolean;
  submitLabel?: string;
  /** Defaults to "<submitLabel>…" so callers rarely pass it. */
  busyLabel?: string;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
  /** Optional width override for the DialogContent (e.g. "sm:max-w-[520px]"). */
  className?: string;
  /** Optional trigger element rendered inside the Dialog (create-style dialogs). */
  trigger?: ReactNode;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {children}

          {error && (
            <p role="alert" className="text-sm text-status-red">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (busyLabel ?? `${submitLabel}…`) : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
