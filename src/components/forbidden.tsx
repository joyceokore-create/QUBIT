import { ShieldOff } from "lucide-react";

export function Forbidden() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-16 text-center">
      <ShieldOff className="mb-2 h-8 w-8 text-ink-3" />
      <h2 className="font-heading text-lg text-foreground">You don&apos;t have access to this page</h2>
      <p className="max-w-sm text-sm text-ink-2">
        This section requires a permission your account doesn&apos;t have. Contact your
        System Administrator if you believe this is a mistake.
      </p>
    </div>
  );
}
