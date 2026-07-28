import { redirect } from "next/navigation";

// The standalone-items index was a "coming soon" placeholder — culled in M0
// (docs/16-revamp-plan.md §2).
export default function StandalonePage() {
  redirect("/projects");
}
