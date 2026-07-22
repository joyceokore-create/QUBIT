"use client";

import { useEffect } from "react";

/**
 * Mirrors the tenant onto <html data-tenant> for the lifetime of the (app) shell.
 * The shell wrapper already carries data-tenant, but portalled UI (dialogs,
 * dropdowns, tooltips, toasts, select menus) renders at the document root —
 * outside that wrapper — so it would otherwise fall back to the product-default
 * brand. Setting the attribute on <html> lets the [data-tenant] token overrides
 * (incl. --brand) reach those portals too. Cleared on unmount (i.e. after sign-out
 * / leaving the app shell) so pre-auth pages keep the product default.
 */
export function TenantScope({ slug }: { slug: string }) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-tenant");
    el.setAttribute("data-tenant", slug);
    return () => {
      if (prev !== null) el.setAttribute("data-tenant", prev);
      else el.removeAttribute("data-tenant");
    };
  }, [slug]);
  return null;
}
