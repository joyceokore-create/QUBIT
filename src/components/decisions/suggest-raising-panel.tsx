import Link from "next/link";
import { Foot, Panel, PanelList, PanelRow, SuggestedPill } from "@/components/ui/panel";
import { TextLink } from "@/components/ui/text-link";
import { suggestedDecisions } from "@/lib/portfolio-home";
import { COMPACT, FOCUS } from "@/lib/surface";
import type { CockpitProject } from "@/server/dashboard-cockpit";

/**
 * WS2 (Tier 4) — for a Head: the old "Decisions needing Group action" signal rule (an open red
 * item, a status dispute past target, or off track with no update for 7+ days) no longer counts
 * as a decision. It is a hint: each row offers "Raise", which opens the Decisions page's
 * Raise drawer with the project filled in. Nothing reaches the Group until a person raises it.
 */
export function SuggestRaisingPanel({ projects, limit = 3 }: { projects: CockpitProject[]; limit?: number }) {
  const hints = suggestedDecisions(projects, limit);
  if (hints.length === 0) return null;
  return (
    <Panel title="Suggest Raising a Decision" action={<TextLink href="/decisions">Decisions</TextLink>}>
      <SuggestedPill />
      <PanelList label="Projects that may need a Group decision">
        {hints.map((h) => (
          <PanelRow
            key={h.projectId}
            title={
              <Link href={h.href} className={`rounded-[3px] hover:underline ${FOCUS}`}>
                {h.projectName}
              </Link>
            }
            sub={`${h.why} · ${h.owner}`}
            chip={
              <Link href={`/decisions?raise=${h.projectId}`} className={COMPACT} aria-label={`Raise a decision for ${h.projectName}`}>
                Raise
              </Link>
            }
          />
        ))}
      </PanelList>
      <Foot>Raising one sends it to the Executives.</Foot>
    </Panel>
  );
}
