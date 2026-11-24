"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * App-wide theme engine (design_handoff Phase 0). Class strategy so the token
 * layers in globals.css (`:root` = light, `.dark` = dark) switch wholesale.
 * Light is the default appearance (2026-10-07): people land on light and switch to dark if
 * they want; the choice persists per browser. UX fidelity F1 (D-F9): "System" is offered in
 * the new layout's account menu, so it's enabled here; the default stays Light.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
