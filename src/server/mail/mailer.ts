import { flagEnabled } from "@/lib/flags";

/**
 * Outbound email (docs/16 §8). Two rules shape this module:
 *
 *  1. **Digest-first.** Almost nothing sends per-event; the daily digest batches. An
 *     inbox full of QUBIT is an inbox nobody reads.
 *  2. **A failed send is never a failed mutation.** `send` resolves with an outcome
 *     instead of throwing, so a mail outage can never roll back a check-in, a report or
 *     an approval. Delivery is best-effort; the in-app bell is the reliable channel.
 *
 * Adapters, chosen at call time so tests and environments can differ:
 *   - graph  — Microsoft 365 client-credentials sendMail, when configured
 *   - log    — records to the console and returns ok; the default when email is off or
 *              unconfigured, so every other code path behaves identically either way.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Always supplied — a mail client that refuses HTML still gets a readable message. */
  text: string;
}

export interface MailResult {
  ok: boolean;
  adapter: "graph" | "log";
  /** Populated when ok=false — surfaced in job results, never thrown at the caller. */
  error?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

function graphConfigured(): boolean {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
      process.env.GRAPH_CLIENT_ID &&
      process.env.GRAPH_CLIENT_SECRET &&
      process.env.GRAPH_SENDER,
  );
}

/** Email actually leaves the building only when the flag is ON and Graph is configured. */
export function emailEnabled(): boolean {
  return flagEnabled("email") && graphConfigured();
}

const logMailer: Mailer = {
  async send(message) {
    // Deliberately not silent: in dev this is the record that the digest ran and what
    // it would have said.
    console.info(`[mail:log] → ${message.to} · ${message.subject}`);
    return { ok: true, adapter: "log" };
  },
};

async function graphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID!,
      client_secret: process.env.GRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("no access_token in response");
  return json.access_token;
}

const graphMailer: Mailer = {
  async send(message) {
    try {
      const token = await graphToken();
      const sender = process.env.GRAPH_SENDER!;
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.html },
            toRecipients: [{ emailAddress: { address: message.to } }],
          },
          saveToSentItems: false,
        }),
      });
      if (!res.ok) return { ok: false, adapter: "graph", error: `sendMail ${res.status}` };
      return { ok: true, adapter: "graph" };
    } catch (e) {
      // Never rethrow: the caller is usually inside a job that must keep going.
      return { ok: false, adapter: "graph", error: e instanceof Error ? e.message : "unknown error" };
    }
  },
};

export function getMailer(): Mailer {
  return emailEnabled() ? graphMailer : logMailer;
}
