import { redirect } from "next/navigation";

// Milestone B — "My week" lives on /reports now (the PM view is the same queue). The
// route stays so bookmarks and older notification links keep landing.
export default function MyWeekPage() {
  redirect("/reports");
}
