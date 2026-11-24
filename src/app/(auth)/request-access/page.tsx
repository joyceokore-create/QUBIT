import type { Metadata } from "next";
import { RequestAccessForm } from "./request-access-form";

export const metadata: Metadata = { title: "Request access — QUBIT" };

// Request access ("Get started"). The form renders the shared two-panel AuthShell (UX plan D8c).
export default function RequestAccessPage() {
  return <RequestAccessForm />;
}
