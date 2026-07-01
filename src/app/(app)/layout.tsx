import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

type BrandStyle = CSSProperties & { "--brand"?: string; "--brand-light"?: string };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const brandStyle: BrandStyle = {
    "--brand": session.user.brandColor,
    "--brand-light": session.user.brandLight,
  };

  return (
    <div style={brandStyle} className="min-h-screen bg-background">
      {children}
    </div>
  );
}
