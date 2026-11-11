// UX fidelity Tier 1: the access-request drawer's optional "Message to …" goes into the invite
// email — escaped (admin-typed text), invite only, and never on a password reset.
import { describe, expect, it } from "vitest";
import { inviteEmail } from "@/server/mail/template";

const base = { name: "user_001", tenantName: "Riverbank Group", brandColor: "#ED1C24", acceptUrl: "https://example.invalid/onboarding/accept?token=x", ttlHours: 72 };

describe("invite email note", () => {
  it("adds the admin's note, escaped, to the HTML and the text versions", () => {
    const m = inviteEmail({ ...base, note: "Welcome <b>aboard</b> & see you Monday" });
    expect(m.html).toContain("Welcome &lt;b&gt;aboard&lt;/b&gt; &amp; see you Monday");
    expect(m.html).not.toContain("<b>aboard</b>");
    expect(m.text).toContain("Welcome <b>aboard</b> & see you Monday");
  });

  it("has no note block when none is given", () => {
    expect(inviteEmail(base).text).not.toContain("undefined");
  });
});
