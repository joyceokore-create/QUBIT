import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TenantChipProps {
  tenantName: string;
  canSwitch: boolean;
}

export function TenantChip({ tenantName, canSwitch }: TenantChipProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-[7px] rounded-full border border-ink-4 bg-background px-3 py-[5px] text-[11px] font-semibold text-ink-2">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand" />
        {tenantName} — All Subsidiaries
        <ChevronDown className="h-3 w-3 text-ink-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{tenantName}</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          {canSwitch ? "Tenant switching — coming soon" : "Viewing all subsidiaries"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
