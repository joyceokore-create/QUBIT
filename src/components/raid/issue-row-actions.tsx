"use client";

import { useState } from "react";
import { MoreHorizontal, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditIssueDialog } from "@/components/raid/edit-issue-dialog";
import type { IssueListItem } from "@/server/issues";
import type { AdminUserSummary } from "@/server/users";

interface IssueRowActionsProps {
  issue: IssueListItem;
  users: AdminUserSummary[];
}

export function IssueRowActions({ issue, users }: IssueRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Issue actions" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen style={{ color: "var(--blue)" }} />
            Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditIssueDialog issue={issue} users={users} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
