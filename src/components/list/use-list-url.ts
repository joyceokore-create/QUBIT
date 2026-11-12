"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parsePage, parseSearch, parseSize, type PageSize } from "@/lib/list-state";

/**
 * UX5 (L2/L3) — a list's view state lives in the URL: tab, search, filters, page and page
 * size, so Back, refresh and shared links keep the view. The same hook drives browser-paged
 * tables (the page re-slices) and server-paged ones (the URL change re-renders the server
 * component, which reads the validated params).
 *
 * Rows per page is also remembered per table in this browser (localStorage), and applied
 * when the URL doesn't name a size.
 */
const sizeKey = (table: string) => `qubit.list.size.${table}`;

function readStoredSize(table: string): string | null {
  try {
    return window.localStorage.getItem(sizeKey(table));
  } catch {
    return null;
  }
}

export interface ListUrl {
  q: string;
  page: number;
  size: PageSize;
  /** Raw value of any other key (a filter or the tab). */
  get: (key: string) => string;
  /** Change keys (null/"" removes one). Any change other than `page` returns to page 1. */
  set: (updates: Record<string, string | number | null>) => void;
  setPage: (page: number) => void;
  setSize: (size: PageSize) => void;
  /** Remove the given filter keys (and the search) — "Clear all". */
  clear: (keys: string[]) => void;
}

export function useListUrl(table: string, defaultSize: PageSize): ListUrl {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlSize = params.get("size");
  const size = parseSize(urlSize, defaultSize);
  const page = parsePage(params.get("page"));
  const q = parseSearch(params.get("q"));

  const push = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const set = useCallback(
    (updates: Record<string, string | number | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (!("page" in updates)) next.delete("page");
      if (next.get("page") === "1") next.delete("page");
      push(next);
    },
    [params, push],
  );

  const setSize = useCallback(
    (s: PageSize) => {
      try {
        window.localStorage.setItem(sizeKey(table), String(s));
      } catch {
        // storage blocked — the URL still carries it
      }
      set({ size: s === defaultSize ? null : s });
    },
    [set, table, defaultSize],
  );

  // Apply the remembered page size once, when the URL doesn't name one.
  useEffect(() => {
    if (urlSize) return;
    const stored = readStoredSize(table);
    const s = parseSize(stored, defaultSize);
    if (stored && s !== defaultSize) set({ size: s, page: params.get("page") });
    // Only on arrival: later changes go through setSize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  return useMemo(
    () => ({
      q,
      page,
      size,
      get: (key: string) => params.get(key) ?? "",
      set,
      setPage: (p: number) => set({ page: p <= 1 ? null : p }),
      setSize,
      clear: (keys: string[]) => set(Object.fromEntries([...keys, "q"].map((k) => [k, null]))),
    }),
    [q, page, size, params, set, setSize],
  );
}
