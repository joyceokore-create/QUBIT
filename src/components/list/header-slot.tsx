"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * UX fidelity Tier 3 — lets a client component put its main action in the server-rendered
 * page header (design: the page's one primary sits top right). The header renders
 * <HeaderSlot id="…" />; the component renders <InHeaderSlot id="…">button</InHeaderSlot>.
 * Until the slot exists (first paint) the action renders nowhere, then appears in the header.
 */
export function HeaderSlot({ id }: { id: string }) {
  return <span id={id} className="contents" />;
}

export function InHeaderSlot({ id, children }: { id: string; children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById(id)), [id]);
  return el ? createPortal(children, el) : null;
}
