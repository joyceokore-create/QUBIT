// Milestone D — the Graph payload is pure so the attachment shape can be pinned without a
// network: a file rides as a base64 fileAttachment, and a message without files sends none.
import { describe, expect, it } from "vitest";
import { graphPayload } from "@/server/mail/mailer";

describe("graphPayload", () => {
  const base = { to: "exec@example.invalid", subject: "Week 41 roll-up", html: "<p>hi</p>", text: "hi" };

  it("sends an HTML body to one recipient and never saves to Sent Items", () => {
    const p = graphPayload(base) as { message: Record<string, unknown>; saveToSentItems: boolean };
    expect(p.saveToSentItems).toBe(false);
    expect(p.message.toRecipients).toEqual([{ emailAddress: { address: base.to } }]);
    expect(p.message.body).toEqual({ contentType: "HTML", content: base.html });
    expect(p.message).not.toHaveProperty("attachments");
  });

  it("attaches files as base64 fileAttachments", () => {
    const p = graphPayload({ ...base, attachments: [{ filename: "qubit-rollup-2026-W41.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4") }] }) as {
      message: { attachments: Record<string, string>[] };
    };
    expect(p.message.attachments).toEqual([
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "qubit-rollup-2026-W41.pdf", contentType: "application/pdf", contentBytes: Buffer.from("%PDF-1.4").toString("base64") },
    ]);
  });
});
