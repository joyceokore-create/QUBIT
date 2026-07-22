"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, SquarePen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditRiskDialog } from "@/components/raid/edit-risk-dialog";
import type { RiskListItem } from "@/server/risks";
import type { AdminUserSummary } from "@/server/users";

interface RiskRowActionsProps {
  risk: RiskListItem;
  users: AdminUserSummary[];
}

export function RiskRowActions({ risk, users }: RiskRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [materialiseOpen, setMaterialiseOpen] = useState(false);
  const [materialiseError, setMaterialiseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmMaterialise() {
    setBusy(true);
    setMaterialiseError(null);
    const res = await fetch(`/api/risks/${risk.id}/materialise`, { method: "POST" });
    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMaterialiseError(body?.error?.message ?? "Could not materialise this risk.");
      return;
    }

    setMaterialiseOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Risk actions" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen style={{ color: "var(--blue)" }} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={risk.materialised}
            onSelect={() => {
              setMaterialiseError(null);
              setMaterialiseOpen(true);
            }}
          >
            <Zap style={{ color: "var(--warn)" }} />
            Materialise
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditRiskDialog risk={risk} users={users} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={materialiseOpen} onOpenChange={setMaterialiseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Materialise this risk into an issue?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new issue linked back to this risk and closes the risk. This can&apos;t
              be undone — a risk can only be materialised once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {materialiseError && (
            <p role="alert" className="text-sm text-status-red">
              {materialiseError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmMaterialise}>
              Materialise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
