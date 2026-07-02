import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Topbar } from "@/components/layout/topbar";
import { Sidebar } from "@/components/layout/sidebar";
import { SlidePanelStateProvider } from "@/components/panels/panel-context";
import { SlidePanel } from "@/components/panels/slide-panel";

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
      <SlidePanelStateProvider>
        <Topbar />
        <div className="flex h-[calc(100vh-54px)]">
          <Sidebar />
          <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
        <SlidePanel />
      </SlidePanelStateProvider>
    </div>
  );
}
