"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommentsSection } from "@/components/conversation/comments-section";

// Slide-in discussion for entities without a page of their own (board cards, risks,
// documents). Controlled by the parent so any row/button can open it.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entityType: "project" | "project_task" | "risk" | "project_document";
  entityId: string | null;
  viewerId: string;
  canPromote: boolean;
  children?: ReactNode;
}

export function ConversationDrawer({ open, onOpenChange, title, entityType, entityId, viewerId, canPromote }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
        <div className="border-b border-[var(--hair)] p-[14px_18px]">
          <SheetTitle className="text-[14px] font-bold text-[var(--qink)]">{title}</SheetTitle>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">Discussion</p>
        </div>
        <div className="p-[14px_18px]">
          {entityId && (
            <CommentsSection entityType={entityType} entityId={entityId} viewerId={viewerId} canPromote={canPromote} compact />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
