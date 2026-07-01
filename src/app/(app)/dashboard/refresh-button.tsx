"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button size="sm" disabled={isPending} onClick={() => startTransition(() => router.refresh())}>
      <RotateCw className={cn(isPending && "animate-spin")} /> Refresh
    </Button>
  );
}
