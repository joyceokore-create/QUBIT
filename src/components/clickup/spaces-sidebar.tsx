"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, ChevronDown, ChevronRight, Hash, MoreHorizontal, Plus, SquarePen, Zap } from "lucide-react";
import type { SpaceNode, FolderNode, ListNode } from "@/server/hierarchy";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Left workspace nav: Space → Folder → List tree (04-module-specs §1). */
export function SpacesSidebar({ tree }: { tree: SpaceNode[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(tree.map((s) => s.id)), // spaces open by default
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function api(url: string, method: string, body?: unknown): Promise<boolean> {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) router.refresh();
    return res.ok;
  }

  const createSpace = async () => {
    const name = window.prompt("New space name")?.trim();
    if (name) await api("/api/v1/spaces", "POST", { name });
  };

  return (
    <nav className="flex h-full w-[260px] flex-none flex-col gap-1 overflow-y-auto border-r border-[var(--w07)] bg-[var(--qcard)] p-3">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[1.5px] text-[var(--ink4)]">
          Spaces
        </span>
        <button
          type="button"
          onClick={createSpace}
          title="New space"
          className="flex size-6 items-center justify-center rounded-[6px] text-[var(--ink4)] transition-colors hover:bg-[var(--w06)] hover:text-brand"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {tree.length === 0 && (
        <p className="px-2 py-6 text-center text-[12px] text-[var(--ink5)]">
          No spaces yet. Create your first one.
        </p>
      )}

      {tree.map((space) => (
        <SpaceItem
          key={space.id}
          space={space}
          expanded={expanded}
          toggle={toggle}
          api={api}
        />
      ))}
    </nav>
  );
}

type ApiFn = (url: string, method: string, body?: unknown) => Promise<boolean>;

function SpaceItem({
  space,
  expanded,
  toggle,
  api,
}: {
  space: SpaceNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  api: ApiFn;
}) {
  const open = expanded.has(space.id);
  const router = useRouter();
  const addList = async () => {
    const name = window.prompt(`New list in "${space.name}"`)?.trim();
    if (name) await api(`/api/v1/spaces/${space.id}/lists`, "POST", { name });
  };
  const rename = async () => {
    const name = window.prompt("Rename space", space.name)?.trim();
    if (name && name !== space.name) await api(`/api/v1/spaces/${space.id}`, "PATCH", { name });
  };
  const archive = async () => {
    if (window.confirm(`Archive "${space.name}"?`)) await api(`/api/v1/spaces/${space.id}`, "DELETE");
  };

  return (
    <div>
      <Row
        depth={0}
        onToggle={() => toggle(space.id)}
        expanded={open}
        hasChildren={space.folders.length + space.lists.length > 0}
        label={
          <>
            <span className="text-[13px]">{space.icon ?? "🗂️"}</span>
            <span className="truncate font-semibold text-[var(--qink)]">{space.name}</span>
          </>
        }
        menu={[
          { label: "Add list", onClick: addList, icon: <Plus style={{ color: "var(--pbrand)" }} /> },
          { label: "Automations", onClick: () => router.push(`/s/${space.id}/automations`), icon: <Zap style={{ color: "var(--accent-indigo)" }} /> },
          { label: "Rename", onClick: rename, icon: <SquarePen style={{ color: "var(--blue)" }} /> },
          { label: "Archive", onClick: archive, destructive: true, icon: <Archive /> },
        ]}
        onAdd={addList}
      />
      {open && (
        <div>
          {space.folders.map((f) => (
            <FolderItem key={f.id} spaceId={space.id} folder={f} expanded={expanded} toggle={toggle} api={api} />
          ))}
          {space.lists.map((l) => (
            <ListLink key={l.id} spaceId={space.id} list={l} depth={1} api={api} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderItem({
  spaceId,
  folder,
  expanded,
  toggle,
  api,
}: {
  spaceId: string;
  folder: FolderNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  api: ApiFn;
}) {
  const open = expanded.has(folder.id);
  const addList = async () => {
    const name = window.prompt(`New list in "${folder.name}"`)?.trim();
    if (name) await api(`/api/v1/folders/${folder.id}/lists`, "POST", { name });
  };
  const rename = async () => {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (name && name !== folder.name) await api(`/api/v1/folders/${folder.id}`, "PATCH", { name });
  };
  const archive = async () => {
    if (window.confirm(`Archive "${folder.name}"?`)) await api(`/api/v1/folders/${folder.id}`, "DELETE");
  };
  return (
    <div>
      <Row
        depth={1}
        onToggle={() => toggle(folder.id)}
        expanded={open}
        hasChildren={folder.folders.length + folder.lists.length > 0}
        label={<span className="truncate text-[var(--ink2)]">{folder.name}</span>}
        menu={[
          { label: "Add list", onClick: addList, icon: <Plus style={{ color: "var(--pbrand)" }} /> },
          { label: "Rename", onClick: rename, icon: <SquarePen style={{ color: "var(--blue)" }} /> },
          { label: "Archive", onClick: archive, destructive: true, icon: <Archive /> },
        ]}
        onAdd={addList}
      />
      {open && (
        <div>
          {folder.folders.map((sf) => (
            <FolderItem key={sf.id} spaceId={spaceId} folder={sf} expanded={expanded} toggle={toggle} api={api} />
          ))}
          {folder.lists.map((l) => (
            <ListLink key={l.id} spaceId={spaceId} list={l} depth={2} api={api} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListLink({
  spaceId,
  list,
  depth,
  api,
}: {
  spaceId: string;
  list: ListNode;
  depth: number;
  api: ApiFn;
}) {
  const params = useParams<{ listId?: string }>();
  const active = params?.listId === list.id;
  const rename = async () => {
    const name = window.prompt("Rename list", list.name)?.trim();
    if (name && name !== list.name) await api(`/api/v1/lists/${list.id}`, "PATCH", { name });
  };
  const archive = async () => {
    if (window.confirm(`Archive "${list.name}"?`)) await api(`/api/v1/lists/${list.id}`, "DELETE");
  };
  return (
    <div
      className={`group flex items-center gap-1 rounded-[7px] pr-1 ${active ? "bg-[color-mix(in_oklab,var(--brand)_14%,transparent)]" : "hover:bg-[var(--w05)]"}`}
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      <Link
        href={`/s/${spaceId}/l/${list.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 py-[6px] text-[13px]"
      >
        <Hash className={`size-3.5 flex-none ${active ? "text-brand" : "text-[var(--ink4)]"}`} />
        <span className={`truncate ${active ? "font-semibold text-brand" : "text-[var(--ink2)]"}`}>
          {list.name}
        </span>
        {list.taskCount > 0 && (
          <span className="ml-auto text-[10.5px] text-[var(--ink5)]">{list.taskCount}</span>
        )}
      </Link>
      <NodeMenu menu={[{ label: "Rename", onClick: rename, icon: <SquarePen style={{ color: "var(--blue)" }} /> }, { label: "Archive", onClick: archive, destructive: true, icon: <Archive /> }]} />
    </div>
  );
}

interface MenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
}

function Row({
  depth,
  expanded,
  hasChildren,
  label,
  menu,
  onToggle,
  onAdd,
}: {
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  label: React.ReactNode;
  menu: MenuItem[];
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-1 rounded-[7px] pr-1 hover:bg-[var(--w05)]"
      style={{ paddingLeft: 4 + depth * 16 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex size-5 flex-none items-center justify-center text-[var(--ink4)]"
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
        ) : (
          <span className="size-3.5" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 py-[6px] text-[13px]">{label}</div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          title="Add list"
          className="flex size-6 flex-none items-center justify-center rounded-[6px] text-[var(--ink4)] opacity-0 transition hover:bg-[var(--w08)] hover:text-brand group-hover:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      )}
      <NodeMenu menu={menu} />
    </div>
  );
}

function NodeMenu({ menu }: { menu: MenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-6 flex-none items-center justify-center rounded-[6px] text-[var(--ink4)] opacity-0 transition hover:bg-[var(--w08)] hover:text-[var(--qink)] group-hover:opacity-100"
        aria-label="More actions"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menu.map((m) => (
          <DropdownMenuItem
            key={m.label}
            variant={m.destructive ? "destructive" : undefined}
            onSelect={m.onClick}
          >
            {m.icon}
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
