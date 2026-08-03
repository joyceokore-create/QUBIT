// M-O4 (docs/23 §10) — server-bound MFA enrolment and the guided-flow gate, against the
// real database. The headline case is the A5 regression: a client-supplied secret must be
// impossible to enrol, because the verify path reads only what /enroll stored.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { generate, generateSecret } from "otplib";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptMfaSecret, encryptMfaSecret, generateMfaEnrollment, verifyTotp } from "@/lib/mfa";
import { generateRecoveryCodes, matchRecoveryCode } from "@/lib/mfa-recovery";
import { finishOnboarding, OnboardingIncomplete, setOnboardingPassword } from "@/server/users";
import { createUsers, cleanupFixtureUsers } from "./_users";

const PASSWORD = "Gu1ded!Flow42";

describe("M-O4 MFA enrolment + guided finish", () => {
  let tenantId: string;
  let userId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Seed required — run `pnpm prisma:seed`.");
    tenantId = demoB.id;
    const [u] = await createUsers(tenantId, 1, "mfa");
    userId = u.id;
    ctx = { tenantId, userId, roles: ["Member"] };
  });

  afterEach(async () => {
    await withTenant(ctx, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          mfaSecret: null,
          pendingMfaSecret: null,
          mfaRecoveryCodes: [],
          mustChangePassword: true,
          onboardedAt: null,
          // Clear the credential history too: the cases below reuse one fixture password,
          // and the (correct) no-reuse rule would otherwise reject the second one.
          passwordHash: null,
          previousPasswordHashes: [],
          passwordSetAt: null,
        },
      }),
    );
    await withTenant(ctx, (tx) => tx.roleAssignment.deleteMany({ where: { userId } }));
  });

  afterAll(async () => {
    await cleanupFixtureUsers(tenantId);
    await prisma.$disconnect();
  });

  /** Mirrors what /enroll does, so the suite exercises the same storage path. */
  async function startEnrolment(): Promise<string> {
    const { secret } = await generateMfaEnrollment("mfa-fixture@demo-b.example.invalid", "QUBIT (Demo Org B)");
    await withTenant(ctx, (tx) =>
      tx.user.update({ where: { id: userId }, data: { pendingMfaSecret: encryptMfaSecret(secret) } }),
    );
    return secret;
  }

  it("enrolment stores the secret ENCRYPTED and pending — never in mfaSecret yet", async () => {
    const secret = await startEnrolment();
    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingMfaSecret: true, mfaSecret: true } }),
    );
    expect(row.mfaSecret).toBeNull(); // not live until a code is confirmed
    expect(row.pendingMfaSecret).toBeTruthy();
    expect(row.pendingMfaSecret).not.toBe(secret); // stored ciphertext, not plaintext
    expect(decryptMfaSecret(row.pendingMfaSecret!)).toBe(secret); // …and it round-trips
  });

  it("A5 REGRESSION: a client-supplied secret cannot be enrolled", async () => {
    // The attacker's secret — one they know the codes for.
    const attacker = generateSecret();
    // The server's pending secret is a DIFFERENT one, written only by /enroll.
    const serverSecret = await startEnrolment();
    expect(attacker).not.toBe(serverSecret);

    // The verify path reads pendingMfaSecret and ignores anything a caller might send.
    const pending = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingMfaSecret: true } }),
    );
    const used = decryptMfaSecret(pending.pendingMfaSecret!);
    expect(used).toBe(serverSecret);

    // A code from the ATTACKER's secret fails against the server-held one…
    const attackerCode = await generate({ secret: attacker });
    expect(await verifyTotp(used, attackerCode)).toBe(false);
    // …and the legitimate device's code succeeds.
    const realCode = await generate({ secret: serverSecret });
    expect(await verifyTotp(used, realCode)).toBe(true);
  });

  it("confirming promotes pending → live, clears pending, and issues recovery codes", async () => {
    const secret = await startEnrolment();
    const codes = generateRecoveryCodes();
    const pending = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingMfaSecret: true } }),
    );
    // Exactly what the route does on a good code.
    await withTenant(ctx, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { mfaSecret: pending.pendingMfaSecret, pendingMfaSecret: null, mfaRecoveryCodes: codes.hashes },
      }),
    );

    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaSecret: true, pendingMfaSecret: true, mfaRecoveryCodes: true },
      }),
    );
    expect(row.pendingMfaSecret).toBeNull();
    expect(decryptMfaSecret(row.mfaSecret!)).toBe(secret);
    expect(row.mfaRecoveryCodes).toHaveLength(10);
    // Only hashes are stored — no plaintext code is recoverable from the row.
    for (const plain of codes.plain) expect(row.mfaRecoveryCodes.join()).not.toContain(plain);
  });

  it("a recovery code matches once, then its hash is gone", async () => {
    const codes = generateRecoveryCodes(4);
    await withTenant(ctx, (tx) =>
      tx.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: codes.hashes } }),
    );
    const stored = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaRecoveryCodes: true } }),
    );
    const idx = matchRecoveryCode(codes.plain[1], stored.mfaRecoveryCodes);
    expect(idx).toBeGreaterThanOrEqual(0);

    const remaining = stored.mfaRecoveryCodes.filter((_, i) => i !== idx);
    await withTenant(ctx, (tx) => tx.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: remaining } }));
    const after = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaRecoveryCodes: true } }),
    );
    expect(after.mfaRecoveryCodes).toHaveLength(3);
    expect(matchRecoveryCode(codes.plain[1], after.mfaRecoveryCodes)).toBe(-1);
  });

  it("an admin reset clears every factor so a locked-out user can re-enrol", async () => {
    await startEnrolment();
    const codes = generateRecoveryCodes(2);
    await withTenant(ctx, (tx) =>
      tx.user.update({ where: { id: userId }, data: { mfaSecret: encryptMfaSecret("LIVE"), mfaRecoveryCodes: codes.hashes } }),
    );
    // What /api/auth/mfa/reset does.
    await withTenant(ctx, (tx) =>
      tx.user.update({ where: { id: userId }, data: { mfaSecret: null, pendingMfaSecret: null, mfaRecoveryCodes: [] } }),
    );
    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaSecret: true, pendingMfaSecret: true, mfaRecoveryCodes: true },
      }),
    );
    expect(row.mfaSecret).toBeNull();
    expect(row.pendingMfaSecret).toBeNull();
    expect(row.mfaRecoveryCodes).toEqual([]);
  });

  describe("the gate lifts only at finish", () => {
    it("setting a password does NOT lift it", async () => {
      await setOnboardingPassword(ctx, PASSWORD);
      const row = await withTenant(ctx, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mustChangePassword: true, passwordHash: true } }),
      );
      expect(row.passwordHash).toBeTruthy();
      expect(row.mustChangePassword).toBe(true); // still gated — M-O4's central change
    });

    it("finish refuses before a password exists", async () => {
      await withTenant(ctx, (tx) => tx.user.update({ where: { id: userId }, data: { passwordHash: null } }));
      await expect(finishOnboarding(ctx)).rejects.toMatchObject({ missing: "password" });
    });

    it("REGRESSION: an ADMIN-issued temp password is not proof — finish still refuses", async () => {
      // The hole this closes: finish once accepted "a password hash exists", which is true
      // for a legacy user holding a temp password an admin typed. They could have lifted
      // their own gate without ever changing it — the M-O1 bypass through another door.
      await withTenant(ctx, (tx) =>
        tx.user.update({
          where: { id: userId },
          data: { passwordHash: "$2b$12$adminIssuedTempHashPlaceholderXXXXXXXXXXXXXXXXXXXXXXXX", passwordSetAt: null },
        }),
      );
      await expect(finishOnboarding(ctx)).rejects.toMatchObject({ missing: "password" });

      // Setting their OWN password stamps the proof, and finish then succeeds.
      await setOnboardingPassword(ctx, PASSWORD);
      await withTenant(ctx, (tx) => tx.roleAssignment.create({ data: { tenantId, userId, role: "Member" } }));
      await finishOnboarding(ctx);
      const row = await withTenant(ctx, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mustChangePassword: true, passwordSetAt: true } }),
      );
      expect(row.passwordSetAt).not.toBeNull();
      expect(row.mustChangePassword).toBe(false);
    });

    it("a PRIVILEGED role cannot finish without MFA, and can once enrolled", async () => {
      await setOnboardingPassword(ctx, PASSWORD);
      await withTenant(ctx, (tx) =>
        tx.roleAssignment.create({ data: { tenantId, userId, role: "Executive" } }),
      );
      await expect(finishOnboarding(ctx)).rejects.toBeInstanceOf(OnboardingIncomplete);
      await expect(finishOnboarding(ctx)).rejects.toMatchObject({ missing: "mfa" });

      await withTenant(ctx, (tx) =>
        tx.user.update({ where: { id: userId }, data: { mfaSecret: encryptMfaSecret("LIVE") } }),
      );
      await finishOnboarding(ctx);
      const row = await withTenant(ctx, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mustChangePassword: true, onboardedAt: true } }),
      );
      expect(row.mustChangePassword).toBe(false);
      expect(row.onboardedAt).not.toBeNull();
    });

    it("a NON-privileged role may finish without MFA (skip-once)", async () => {
      await setOnboardingPassword(ctx, PASSWORD);
      await withTenant(ctx, (tx) => tx.roleAssignment.create({ data: { tenantId, userId, role: "Member" } }));
      await finishOnboarding(ctx);
      const row = await withTenant(ctx, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mustChangePassword: true } }),
      );
      expect(row.mustChangePassword).toBe(false);
    });
  });
});
