"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type JsonBody = Record<string, unknown> | unknown[];

interface MutateOptions {
  /**
   * Runs after a successful (res.ok) response — e.g. close the dialog, switch phase.
   * Receives the parsed JSON body when there is one (M-O3 needs the invite result), or
   * undefined for empty/non-JSON responses.
   */
  onSuccess?: (data?: unknown) => void;
  /** Refresh the route tree on success so server components re-render (default true). */
  refresh?: boolean;
  /** Message shown when the server returns no `{ error: { message } }` body. */
  fallback?: string;
}

/**
 * The one shared admin-CRUD mutation primitive (docs/20 M-O2). It owns the busy/error
 * state, issues the fetch, reads the standard `{ error: { message } }` envelope, and
 * refreshes the route on success — replacing the hand-rolled
 * `useState(loading/error) + fetch + res.ok ? refresh : setError` block that was copied
 * into every admin dialog. Callers get `{ busy, error, setError, mutate }` and decide what
 * happens on success via `onSuccess`.
 */
export function useAdminMutation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (
      url: string,
      method: "POST" | "PATCH" | "DELETE",
      body?: JsonBody,
      options: MutateOptions = {},
    ): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        // Read the body once: it carries either the error envelope or the success payload.
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          setError(
            (payload as { error?: { message?: string } } | null)?.error?.message ??
              options.fallback ??
              "Something went wrong.",
          );
          return false;
        }
        if (options.refresh !== false) router.refresh();
        options.onSuccess?.(payload ?? undefined);
        return true;
      } catch {
        setError(options.fallback ?? "Network error — please try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, setError, mutate };
}
