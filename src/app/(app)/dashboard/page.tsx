import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl text-foreground">Welcome, {session?.user?.name}</h1>
      <p className="text-ink-2">
        Signed in to <span className="font-medium text-brand">{session?.user?.tenantName}</span> —
        the full executive dashboard lands in Milestone 4.
      </p>
      <p className="text-xs text-ink-3">Roles: {session?.user?.roles?.join(", ")}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
