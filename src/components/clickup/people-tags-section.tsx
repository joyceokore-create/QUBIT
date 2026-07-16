"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusColor } from "@/components/clickup/status-color";

interface Person {
  userId: string;
  user: { name: string } | null;
}
interface TagRef {
  tagId: string;
  tag: { name: string; colorToken: string } | null;
}
interface User {
  id: string;
  name: string;
}
interface Tag {
  id: string;
  name: string;
  colorToken: string;
}

// Small semantic palette for new tags (token keys, never raw hex).
const TAG_COLORS = ["brand", "info", "warn", "bad", "ok", "neutral"];

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

async function toggle(url: string, on: boolean) {
  return fetch(url, { method: on ? "POST" : "DELETE" });
}

export function PeopleTagsSection({
  taskId,
  spaceId,
  assignees,
  watchers,
  tags,
  onReload,
}: {
  taskId: string;
  spaceId: string;
  assignees: Person[];
  watchers: Person[];
  tags: TagRef[];
  onReload: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [spaceTags, setSpaceTags] = useState<Tag[]>([]);

  const loadTags = useCallback(async () => {
    const r = await fetch(`/api/v1/spaces/${spaceId}/tags`);
    if (r.ok) setSpaceTags((await r.json()).data ?? []);
  }, [spaceId]);

  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => {});
    void loadTags();
  }, [loadTags]);

  const assignedIds = new Set(assignees.map((a) => a.userId));
  const watcherIds = new Set(watchers.map((w) => w.userId));
  const taggedIds = new Set(tags.map((t) => t.tagId));

  const createTag = async () => {
    const name = window.prompt("New tag name")?.trim();
    if (!name) return;
    const color = TAG_COLORS[spaceTags.length % TAG_COLORS.length];
    const res = await fetch(`/api/v1/spaces/${spaceId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, colorToken: color }),
    });
    if (res.ok) {
      await loadTags();
      const { data } = await res.json();
      await toggle(`/api/v1/tasks/${taskId}/tags/${data.id}`, true);
      onReload();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Assignees */}
      <div className="flex items-center gap-2">
        <span className="w-[76px] flex-none text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
          Assignees
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignees.map((a) => (
            <Chip
              key={a.userId}
              label={initials(a.user?.name ?? "?")}
              title={a.user?.name ?? ""}
              onRemove={async () => {
                await toggle(`/api/v1/tasks/${taskId}/assignees/${a.userId}`, false);
                onReload();
              }}
            />
          ))}
          <PeoplePicker
            users={users}
            selected={assignedIds}
            label="Assign"
            onToggle={async (userId, on) => {
              await toggle(`/api/v1/tasks/${taskId}/assignees/${userId}`, on);
              onReload();
            }}
          />
        </div>
      </div>

      {/* Watchers */}
      <div className="flex items-center gap-2">
        <span className="w-[76px] flex-none text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
          Watchers
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {watchers.map((w) => (
            <Chip
              key={w.userId}
              label={initials(w.user?.name ?? "?")}
              title={w.user?.name ?? ""}
              onRemove={async () => {
                await toggle(`/api/v1/tasks/${taskId}/watchers/${w.userId}`, false);
                onReload();
              }}
            />
          ))}
          <PeoplePicker
            users={users}
            selected={watcherIds}
            label="Watch"
            onToggle={async (userId, on) => {
              await toggle(`/api/v1/tasks/${taskId}/watchers/${userId}`, on);
              onReload();
            }}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2">
        <span className="w-[76px] flex-none text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
          Tags
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t.tagId}
              className="group flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                color: statusColor(t.tag?.colorToken ?? "neutral"),
                background: `color-mix(in oklab, ${statusColor(t.tag?.colorToken ?? "neutral")} 14%, transparent)`,
              }}
            >
              {t.tag?.name}
              <button
                type="button"
                onClick={async () => {
                  await toggle(`/api/v1/tasks/${taskId}/tags/${t.tagId}`, false);
                  onReload();
                }}
                className="opacity-0 group-hover:opacity-100"
                aria-label="Remove tag"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-full border border-dashed border-[var(--w14)] px-2 py-0.5 text-[11px] text-[var(--ink4)] hover:border-brand hover:text-brand">
              <Plus className="size-3" /> Tag
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[280px] overflow-y-auto">
              <DropdownMenuLabel>Tags</DropdownMenuLabel>
              {spaceTags.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={taggedIds.has(t.id)}
                  onCheckedChange={async (on) => {
                    await toggle(`/api/v1/tasks/${taskId}/tags/${t.id}`, on);
                    onReload();
                  }}
                >
                  <span style={{ color: statusColor(t.colorToken) }}>●</span> {t.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => createTag()}>
                <Plus className="size-3.5" /> New tag…
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, title, onRemove }: { label: string; title: string; onRemove: () => void }) {
  return (
    <span
      title={title}
      className="group flex items-center gap-1 rounded-full bg-[var(--elev)] py-0.5 pl-0.5 pr-1.5 text-[11px] text-[var(--ink2)]"
    >
      <span
        className="flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-[var(--onbrand)]"
        style={{ background: "linear-gradient(135deg, var(--av1), var(--av2))", color: "var(--qink)" }}
      >
        {label}
      </span>
      <button type="button" onClick={onRemove} className="opacity-0 group-hover:opacity-100" aria-label="Remove">
        <X className="size-3" />
      </button>
    </span>
  );
}

function PeoplePicker({
  users,
  selected,
  label,
  onToggle,
}: {
  users: User[];
  selected: Set<string>;
  label: string;
  onToggle: (userId: string, on: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-6 items-center justify-center rounded-full border border-dashed border-[var(--w14)] text-[var(--ink4)] hover:border-brand hover:text-brand" title={label}>
        <Plus className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {users.map((u) => (
          <DropdownMenuCheckboxItem
            key={u.id}
            checked={selected.has(u.id)}
            onCheckedChange={(on) => onToggle(u.id, on)}
          >
            {u.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
