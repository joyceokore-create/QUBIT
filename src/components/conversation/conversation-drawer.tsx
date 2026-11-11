"use client";

import type { ReactNode } from "react";
import { Drawer, DrawerFrame, DrawerHeader } from "@/components/ui/drawer";
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
    <Drawer open={open} onClose={() => onOpenChange(false)}>
      <DrawerFrame header={<DrawerHeader step="Discussion" title={title} />}>
        {entityId && <CommentsSection entityType={entityType} entityId={entityId} viewerId={viewerId} canPromote={canPromote} compact />}
      </DrawerFrame>
    </Drawer>
  );
}
