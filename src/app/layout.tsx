import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

// Fonts are self-hosted (src/app/fonts, Latin subset, all SIL OFL) rather than fetched from
// Google at build time: Google sometimes answers with /l/font?kit= URLs that the Turbopack
// font loader can't resolve, which failed the production Docker build.

// QUBIT App v3 type system (product default / pre-auth): Archivo (headings/wordmark),
// Instrument Sans (body), IBM Plex Mono (labels, codes, metrics).
const instrument = localFont({
  variable: "--font-instrument",
  src: [{ path: "./fonts/instrument-sans-400-700.woff2", weight: "400 700", style: "normal" }],
});

const archivo = localFont({
  variable: "--font-archivo",
  src: [{ path: "./fonts/archivo-500-800.woff2", weight: "500 800", style: "normal" }],
});

const plexMono = localFont({
  variable: "--font-plex",
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
});

// Per-tenant faces. Loaded globally (loading ≠ applying); globals.css repoints the
// --font-display/-body/-num indirection vars per [data-tenant] so only the matching
// tenant uses them. Riverbank → Plus Jakarta Sans + Inter (tabular). (KCB's licensed
// Lufga face left with the tenant — M10, DM1.46.)
const jakarta = localFont({
  variable: "--font-jakarta",
  src: [{ path: "./fonts/jakarta-400-800.woff2", weight: "400 800", style: "normal" }],
});

const inter = localFont({
  variable: "--font-inter",
  src: [{ path: "./fonts/inter-300-800.woff2", weight: "300 800", style: "normal" }],
});

export const metadata: Metadata = {
  title: "QUBIT — Enterprise PPM",
  description: "Portfolio & Programme Management for Riverbank Group",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrument.variable} ${archivo.variable} ${plexMono.variable} ${jakarta.variable} ${inter.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
