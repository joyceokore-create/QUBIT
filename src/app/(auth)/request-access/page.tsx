import type { Metadata } from "next";
import { RequestAccessForm } from "./request-access-form";

export const metadata: Metadata = { title: "Request access — QUBIT" };

// Request access ("Get started"). The form renders its own full-screen brand canvas via AuthShell.
export default function RequestAccessPage() {
  return <RequestAccessForm />;
}
