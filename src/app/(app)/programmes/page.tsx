import { redirect } from "next/navigation";

// DM1.73 — Programmes merged into Portfolios: every programme card here linked to
// its parent portfolio anyway, and programmes are managed from the portfolio detail
// page. The route stays so old links and bookmarks don't 404 — they land on the
// portfolios index instead.
export default function ProgrammesPage() {
  redirect("/portfolios");
}
