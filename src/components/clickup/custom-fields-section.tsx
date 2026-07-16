"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

interface FieldConfig {
  options?: { id: string; label: string }[];
  max?: number;
  currency?: string;
  formula?: string;
}
interface Field {
  id: string;
  name: string;
  type: string;
  config: FieldConfig;
  required: boolean;
  value: unknown;
  computed: boolean;
}

// Types the quick-create control offers (scalar + dropdown/formula prompts).
const CREATE_TYPES = [
  "TEXT",
  "NUMBER",
  "MONEY",
  "DATE",
  "CHECKBOX",
  "DROPDOWN",
  "URL",
  "EMAIL",
  "PHONE",
  "RATING",
  "PROGRESS_MANUAL",
  "FORMULA",
];

async function putValue(taskId: string, fieldId: string, value: unknown) {
  return fetch(`/api/v1/tasks/${taskId}/fields/${fieldId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

export function CustomFieldsSection({ taskId, listId }: { taskId: string; listId: string }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("TEXT");

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/tasks/${taskId}/fields`);
    if (res.ok) setFields((await res.json()).data ?? []);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (fieldId: string, value: unknown) => {
    const res = await putValue(taskId, fieldId, value);
    if (res.ok) void load();
  };

  const createField = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const config: FieldConfig = {};
    if (type === "DROPDOWN") {
      const raw = window.prompt("Options (comma-separated)")?.trim();
      if (!raw) return;
      config.options = raw.split(",").map((s) => s.trim()).filter(Boolean).map((label, i) => ({ id: `o${i}`, label }));
    }
    if (type === "FORMULA") {
      const f = window.prompt("Formula (reference fields by name, e.g. {Budget} * 1.1)")?.trim();
      if (!f) return;
      config.formula = f;
    }
    const res = await fetch(`/api/v1/locations/list/${listId}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed, type, config }),
    });
    if (res.ok) {
      setName("");
      setType("TEXT");
      setAdding(false);
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
        Custom fields
      </div>

      {fields.map((f) => (
        <div key={f.id} className="flex items-center gap-3">
          <span className="w-[120px] flex-none truncate text-[12px] text-[var(--ink3)]" title={f.name}>
            {f.name}
            {f.required && <span className="text-[var(--bad)]"> *</span>}
          </span>
          <div className="min-w-0 flex-1">
            <FieldEditor field={f} onSave={(v) => save(f.id, v)} />
          </div>
        </div>
      ))}
      {fields.length === 0 && (
        <p className="text-[12px] text-[var(--ink5)]">No custom fields on this list yet.</p>
      )}

      {adding ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createField()}
            placeholder="Field name"
            className="flex-1 rounded-[7px] border border-[var(--w10)] bg-[var(--card2)] px-2 py-1.5 text-[12.5px] text-[var(--qink)] outline-none"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-[7px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
          >
            {CREATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createField}
            className="rounded-[7px] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-[var(--onbrand)]"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-fit items-center gap-1 text-[12px] font-semibold text-[var(--ink4)] hover:text-brand"
        >
          <Plus className="size-3.5" /> Add field
        </button>
      )}
    </div>
  );
}

const INPUT = "w-full rounded-[7px] border border-[var(--w10)] bg-[var(--elev)] px-2.5 py-1.5 text-[13px] text-[var(--qink)] outline-none focus:border-brand";

function FieldEditor({ field, onSave }: { field: Field; onSave: (v: unknown) => void }) {
  const v = field.value;

  if (field.computed) {
    const display =
      field.type === "FORMULA" || field.type === "PROGRESS_AUTO"
        ? v === null || v === undefined
          ? "—"
          : field.type === "PROGRESS_AUTO"
            ? `${v}%`
            : String(v)
        : "—";
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-[var(--ink2)]">
        {display}
        <span className="text-[10px] uppercase tracking-[.5px] text-[var(--ink5)]">· auto</span>
      </span>
    );
  }

  switch (field.type) {
    case "LONG_TEXT":
      return (
        <textarea
          defaultValue={(v as string) ?? ""}
          onBlur={(e) => onSave(e.target.value || null)}
          rows={2}
          className={INPUT}
        />
      );
    case "NUMBER":
    case "MONEY":
      return (
        <div className="flex items-center gap-1">
          {field.type === "MONEY" && <span className="text-[12px] text-[var(--ink4)]">{field.config.currency ?? "$"}</span>}
          <input
            type="number"
            defaultValue={v === null || v === undefined ? "" : String(v)}
            onBlur={(e) => onSave(e.target.value === "" ? null : Number(e.target.value))}
            className={INPUT}
          />
        </div>
      );
    case "DATE":
      return (
        <input
          type="date"
          defaultValue={typeof v === "string" ? v.slice(0, 10) : ""}
          onChange={(e) => onSave(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className={INPUT}
        />
      );
    case "CHECKBOX":
      return (
        <input
          type="checkbox"
          checked={Boolean(v)}
          onChange={(e) => onSave(e.target.checked)}
          className="size-4 accent-[var(--brand)]"
        />
      );
    case "DROPDOWN":
      return (
        <select
          value={(v as string) ?? ""}
          onChange={(e) => onSave(e.target.value || null)}
          className={INPUT}
        >
          <option value="">—</option>
          {(field.config.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "RATING": {
      const max = field.config.max ?? 5;
      const cur = typeof v === "number" ? v : 0;
      return (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onSave(n === cur ? 0 : n)}
              className={n <= cur ? "text-[var(--warn)]" : "text-[var(--ink5)]"}
              aria-label={`${n} star`}
            >
              ★
            </button>
          ))}
        </div>
      );
    }
    case "PROGRESS_MANUAL": {
      const cur = typeof v === "number" ? v : 0;
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={cur}
            onMouseUp={(e) => onSave(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onSave(Number((e.target as HTMLInputElement).value))}
            className="flex-1 accent-[var(--brand)]"
          />
          <span className="w-9 text-right text-[12px] text-[var(--ink3)]">{cur}%</span>
        </div>
      );
    }
    case "PEOPLE":
    case "RELATIONSHIP":
    case "FILES":
    case "LABELS":
      // Rich editors deferred; show a read-only summary for now.
      return (
        <span className="text-[12px] text-[var(--ink4)]">
          {Array.isArray(v) && v.length ? `${v.length} selected` : "—"}
        </span>
      );
    default:
      // TEXT / URL / EMAIL / PHONE
      return (
        <input
          type={field.type === "URL" ? "url" : field.type === "EMAIL" ? "email" : "text"}
          defaultValue={(v as string) ?? ""}
          onBlur={(e) => onSave(e.target.value || null)}
          className={INPUT}
        />
      );
  }
}
