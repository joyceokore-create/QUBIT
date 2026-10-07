import { redirect } from "next/navigation";

// Configs landing — redirect to the first section (Integrations). Add more sections as tabs
// in configs-header.tsx.
export default function ConfigsPage() {
  redirect("/configs/integrations");
}
