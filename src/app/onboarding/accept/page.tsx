import Link from "next/link";
import { AcceptForm } from "./accept-form";

/**
 * PUBLIC invite-accept page (docs/22 §6). No session — that is the point: the invitee has
 * never signed in. The token in the query string is the capability; it is validated
 * server-side by the accept API, never here.
 *
 * The page deliberately does NOT look up the token to personalise itself: doing so would
 * turn page loads into a token-probing oracle. It shows the same shell either way, and
 * the API returns one generic message for every invalid/expired/consumed case.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div
      className="app-shell flex min-h-screen items-center justify-center px-5 py-10"
      style={{
        // Pre-auth: no tenant is known yet, so this uses the product default rather than
        // guessing a brand from the token.
        ["--brand" as string]: "var(--pbrand)",
        backgroundColor: "var(--qbg)",
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%), radial-gradient(var(--w06) 1px, transparent 1.5px)",
        backgroundSize: "auto, 26px 26px",
      }}
    >
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--w08)] bg-[var(--qcard)] p-7">
        <h1 className="text-[20px] font-bold text-[var(--qink)]">Welcome to QUBIT</h1>

        {token ? (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink3)]">
              Set a password to activate your account. This link can be used once.
            </p>
            <AcceptForm token={token} />
          </>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink3)]">
              This link is invalid or has expired. Ask your administrator to send a new invite.
            </p>
            <Link href="/login" className="mt-4 inline-block text-[12.5px] font-semibold text-brand hover:underline">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
