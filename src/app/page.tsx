import { redirect } from "next/navigation";

// Unauthenticated requests never reach here — middleware.ts redirects to /login first.
export default function Home() {
  redirect("/dashboard");
}
