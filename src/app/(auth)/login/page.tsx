import { prisma } from "@/lib/db";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const tenants = await prisma.tenant.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <LoginForm tenants={tenants} callbackUrl={callbackUrl ?? "/dashboard"} />
    </div>
  );
}
