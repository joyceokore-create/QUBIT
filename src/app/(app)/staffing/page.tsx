import { redirect } from "next/navigation";

// DM1.73 — Staffing merged into People: resource requests now live on the People
// page's "Staffing requests" tab (gated on project:create there, same as here).
// The route stays so old links and notification deep-links don't 404.
export default function StaffingPage() {
  redirect("/people?tab=requests");
}
