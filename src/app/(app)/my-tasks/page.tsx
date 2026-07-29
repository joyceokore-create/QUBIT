import { redirect } from "next/navigation";

// docs/18 §4: the personal board replaced My Tasks as the daily surface. The route
// stays as a redirect so old notification deep links keep working.
export default function MyTasksPage() {
  redirect("/board");
}
