"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UX fidelity Tier 3 — the edit forms that were centred dialogs now open as the design's
 * right-hand drawer (floating, 10px from the edges, 18px radius — designer, 12 Nov 2026) (docs/08 § Drawer: 440px, wide 580px, scrim without blur, header 18×20
 * with a bordered 32px close, body 16×20, footer right-aligned with a top rule).
 *
 * Drop-in for `@/components/ui/dialog`: the same export names and props, so converting a
 * form is an import swap. Header and footer stick to the top and bottom while the body
 * scrolls, wherever they sit in the tree (forms often wrap all three).
 *
 * Width: `wide` on DialogContent, or a className asking for a max width ≥ 500px (the old
 * dialogs' `sm:max-w-[560px]` etc.) opens the 580px drawer. Other className values are
 * ignored on purpose: centred-dialog sizing never applies to a drawer.
 */

function Dialog(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function DialogTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function DialogClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const WIDE = /max-w-(?:\[(?:5\d\d|[6-9]\d\d)px\]|lg|xl|2xl|3xl|4xl)/;

function DialogContent({
  className,
  children,
  wide,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & { wide?: boolean; showCloseButton?: boolean }) {
  const isWide = wide ?? (typeof className === "string" && WIDE.test(className));
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--ds-scrim)] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side="right"
        className={cn(
          "fixed inset-y-[10px] right-[10px] z-50 flex w-[calc(100%-20px)] flex-col overflow-hidden rounded-[18px] bg-[var(--ds-card)] text-sm text-[var(--ds-ink)] shadow-[var(--ds-shadow-drawer)] outline-none transition duration-200 ease-in-out data-ending-style:translate-x-[2.5rem] data-ending-style:opacity-0 data-starting-style:translate-x-[2.5rem] data-starting-style:opacity-0",
          isWide ? "sm:max-w-[var(--ds-drawer-w-wide)]" : "sm:max-w-[var(--ds-drawer-w)]",
        )}
        {...props}
      >
        <div className="ds-form flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 [&>form]:flex [&>form]:flex-1 [&>form]:flex-col [&>form]:gap-3.5">
          {children}
        </div>
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute right-5 top-[18px] z-10 grid size-8 place-items-center rounded-[var(--ds-radius-compact)] border border-[var(--ds-line)] bg-[var(--ds-card)] text-[var(--ds-ink2)] transition-colors hover:bg-[var(--ds-surface2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)]"
          >
            <XIcon className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

/** Drawer header: sticks to the top, full bleed, room on the right for the close button. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("sticky top-0 z-[1] -mx-5 flex flex-col gap-0.5 bg-[var(--ds-card)] px-5 pb-2 pt-[18px] pr-16", className)}
      {...props}
    />
  );
}

/** Drawer footer: sticks to the bottom, right-aligned buttons, a top rule. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("sticky bottom-0 z-[1] -mx-5 -mb-4 mt-auto flex flex-wrap items-center justify-end gap-2 bg-[var(--ds-card)] px-5 pb-4 pt-3", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("mt-0.5 font-sans text-[17px] font-bold text-[var(--ds-ink)]", className)} {...props} />;
}

function DialogDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("mt-0.5 text-[12px] text-[var(--ds-ink3)]", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
