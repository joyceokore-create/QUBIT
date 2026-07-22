import type { Metadata } from "next";
import { Archivo, Instrument_Sans, IBM_Plex_Mono, Plus_Jakarta_Sans, Inter } from "next/font/google";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

// QUBIT App v3 type system (product default / pre-auth): Archivo (headings/wordmark),
// Instrument Sans (body), IBM Plex Mono (labels, codes, metrics).
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Per-tenant faces. Loaded globally (loading ≠ applying); globals.css repoints the
// --font-display/-body/-num indirection vars per [data-tenant] so only the matching
// tenant uses them. KCB → Lufga; Riverbank → Plus Jakarta Sans + Inter (tabular).
const lufga = localFont({
  variable: "--font-lufga",
  display: "swap",
  src: [
    { path: "../assets/KCB/LufgaLight.woff", weight: "300", style: "normal" },
    { path: "../assets/KCB/LufgaRegular.woff", weight: "400", style: "normal" },
    { path: "../assets/KCB/LufgaMedium.woff", weight: "500", style: "normal" },
    { path: "../assets/KCB/LufgaSemiBold.woff", weight: "600", style: "normal" },
    { path: "../assets/KCB/LufgaBold.woff", weight: "700", style: "normal" },
    { path: "../assets/KCB/LufgaExtraBold.woff", weight: "800", style: "normal" },
    { path: "../assets/KCB/LufgaBlack.woff", weight: "900", style: "normal" },
  ],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "QUBIT — Enterprise PPM",
  description: "Portfolio & Programme Management for Riverbank Group and KCB Group",
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
      className={`${instrument.variable} ${archivo.variable} ${plexMono.variable} ${lufga.variable} ${jakarta.variable} ${inter.variable}`}
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
