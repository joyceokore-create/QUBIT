import { redirect } from "next/navigation";

// The portfolio index was a "coming soon" placeholder — culled in M0
// (docs/16-revamp-plan.md §2). Portfolio drill-downs live at /portfolios/[id];
// the delivery ledger is /projects.
export default function PortfoliosPage() {
  redirect("/projects");
}
