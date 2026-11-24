"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZodType } from "zod";
import { fieldErrorsFromIssues, firstInvalid, type FieldErrors } from "@/lib/form-errors";

/**
 * Field-level error state (docs/08 § Errors; mwashukes-desk/plans/error-states-plan.md).
 *
 *  - Submit / Next stays enabled. `validate()` checks the whole form (or a wizard step's fields),
 *    shows every problem on its field and focuses the first one.
 *  - While typing: a field's error only APPEARS after the person leaves it or pauses ~1 s (never on
 *    the first keystroke, never on an untouched empty field before a submit), and CLEARS on the
 *    keystroke that fixes it.
 *  - Server field errors (`setServerErrors`) show on their field and clear when that field changes.
 *
 * Bind a control with `{...bind("email")}` (id, aria-invalid, aria-describedby, onBlur) and pass
 * `error={errors.email}` + `htmlFor={idOf("email")}` to the `Field`, which renders the message
 * with id `${id}-error`.
 */
const SHOW_AFTER_PAUSE_MS = 1000;

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export interface FieldBinding {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
  onBlur: () => void;
}

export interface GroupBinding {
  id: string;
  role: "group";
  tabIndex: -1;
  "data-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

export function useFieldErrors<V extends Record<string, unknown>>({
  schema,
  values,
  idPrefix,
  paths,
}: {
  schema: ZodType;
  values: V;
  /** Ids become `${idPrefix}-${field}` (and `${…}-error` for the message); "" = the field name. */
  idPrefix: string;
  /** Rename schema paths to form field names, e.g. `{ projectId: "project" }`. */
  paths?: Record<string, string>;
}) {
  const [shown, setShown] = useState<FieldErrors>({});
  const [server, setServer] = useState<FieldErrors>({});
  const armed = useRef(new Set<string>()); // submitted, or left with a value: errors may show live
  const pending = useRef(new Set<string>()); // changed since the last pause
  const latest = useRef(values);
  const prev = useRef(values);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathsKey = JSON.stringify(paths ?? {});
  // The schema in force: the hook's own, or the one the last `validate(…, { schema })` used
  // (e.g. a note required only for "Return"), so live re-checks follow that action's rules.
  const activeSchema = useRef<ZodType | null>(null);

  const compute = useCallback(
    (v: V): FieldErrors => {
      const r = (activeSchema.current ?? schema).safeParse(v);
      return r.success ? {} : fieldErrorsFromIssues(r.error.issues, JSON.parse(pathsKey) as Record<string, string>);
    },
    [schema, pathsKey],
  );

  const idOf = useCallback((field: string) => (idPrefix ? `${idPrefix}-${field}` : field), [idPrefix]);
  const focusField = useCallback((field: string | null) => {
    if (field) window.requestAnimationFrame(() => document.getElementById(idPrefix ? `${idPrefix}-${field}` : field)?.focus());
  }, [idPrefix]);

  useEffect(() => {
    latest.current = values;
    const changed = Object.keys(values).filter((k) => values[k] !== prev.current[k]);
    prev.current = values;
    if (changed.length === 0) return;

    // A server error belongs to the value it rejected: editing the field clears it.
    setServer((s) => {
      if (!changed.some((k) => k in s)) return s;
      const n = { ...s };
      for (const k of changed) delete n[k];
      return n;
    });

    // Fixed → clear on this keystroke.
    const current = compute(values);
    setShown((s) => {
      const fixed = Object.keys(s).filter((k) => !current[k]);
      if (fixed.length === 0) return s;
      const n = { ...s };
      for (const k of fixed) delete n[k];
      return n;
    });

    // Still wrong → show after a pause (only for fields with a value, or already armed).
    for (const k of changed) pending.current.add(k);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = compute(latest.current);
      const keys = [...pending.current];
      pending.current.clear();
      setShown((s) => {
        let n = s;
        for (const k of keys) {
          const show = armed.current.has(k) || !isEmpty(latest.current[k]);
          if (show && now[k] && s[k] !== now[k]) {
            if (n === s) n = { ...s };
            n[k] = now[k];
          }
        }
        return n;
      });
    }, SHOW_AFTER_PAUSE_MS);
  }, [values, compute]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onBlur = useCallback(
    (field: string) => {
      const v = latest.current[field];
      if (isEmpty(v) && !armed.current.has(field)) return; // untouched empty field: say nothing yet
      armed.current.add(field);
      const err = compute(latest.current)[field];
      setShown((s) => {
        if ((s[field] ?? undefined) === err) return s;
        const n = { ...s };
        if (err) n[field] = err;
        else delete n[field];
        return n;
      });
    },
    [compute],
  );

  /** Check the whole form, or only `fields` (a wizard step). Returns true when clean; otherwise
   * shows every problem in scope and focuses the first. `schema` applies rules for one action
   * (e.g. a reason required only when returning) and stays in force for live re-checks until
   * `reset()` or the next `validate` without it. */
  const validate = useCallback(
    (fields?: string[], opts?: { schema?: ZodType }): boolean => {
      activeSchema.current = opts?.schema ?? null;
      const all = compute(latest.current);
      const scope = fields ?? Array.from(new Set([...Object.keys(latest.current), ...Object.keys(all)]));
      for (const f of scope) armed.current.add(f);
      setShown((s) => {
        const n = { ...s };
        for (const f of scope) {
          if (all[f]) n[f] = all[f];
          else delete n[f];
        }
        return n;
      });
      const first = firstInvalid(scope, all);
      focusField(first);
      return first === null;
    },
    [compute, focusField],
  );

  /** Show server-side field errors (from the API's `error.fields`); focuses the first. */
  const setServerErrors = useCallback(
    (fields: FieldErrors, order?: string[]) => {
      const { _: _root, ...onFields } = fields;
      for (const f of Object.keys(onFields)) armed.current.add(f);
      setServer(onFields);
      focusField(firstInvalid(order ?? Object.keys(onFields), onFields));
    },
    [focusField],
  );

  const reset = useCallback(() => {
    activeSchema.current = null;
    armed.current.clear();
    pending.current.clear();
    if (timer.current) clearTimeout(timer.current);
    setShown({});
    setServer({});
  }, []);

  const errors = useMemo<FieldErrors>(() => ({ ...shown, ...server }), [shown, server]);

  const bind = useCallback(
    (field: string): FieldBinding => ({
      id: idOf(field),
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${idOf(field)}-error` : undefined,
      onBlur: () => onBlur(field),
    }),
    [errors, idOf, onBlur],
  );

  /** For a group of controls (checkbox list, chip picker, radio cards): `aria-invalid` isn't
   * allowed on role="group", so the group carries `data-invalid` (style with GROUP_INVALID in
   * surface.ts) and points at its message; tabIndex -1 lets `validate()` move focus to it. */
  const bindGroup = useCallback(
    (field: string): GroupBinding => ({
      id: idOf(field),
      role: "group",
      tabIndex: -1,
      "data-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${idOf(field)}-error` : undefined,
    }),
    [errors, idOf],
  );

  return { errors, bind, bindGroup, idOf, validate, setServerErrors, reset, hasErrors: Object.keys(errors).length > 0 };
}
