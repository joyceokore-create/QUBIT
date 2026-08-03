import { createHash, randomBytes } from "node:crypto";

/**
 * MFA recovery codes (docs/23 §4). The answer to "I lost my phone" that isn't "ask an
 * admin to disable your second factor".
 *
 * Same storage discipline as passwords and invite tokens: only SHA-256 hashes are
 * persisted, the plaintext is shown exactly once at enrolment, and a used code's hash is
 * removed so possession of a screenshot can't be replayed forever.
 */

const DEFAULT_COUNT = 10;

export interface RecoveryCodes {
  /** Shown to the user ONCE. Never stored. */
  plain: string[];
  /** Persisted to User.mfaRecoveryCodes. */
  hashes: string[];
}

/** e.g. "a1b2c-3d4e5" — grouped for readable transcription off a screen or paper. */
export function generateRecoveryCodes(n: number = DEFAULT_COUNT): RecoveryCodes {
  const plain = Array.from({ length: n }, () =>
    randomBytes(5).toString("hex").replace(/^(.{5})(.{5})$/, "$1-$2"),
  );
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  // Normalised so a user typing "A1B2C 3D4E5" still matches what we stored.
  return createHash("sha256").update(normalise(code)).digest("hex");
}

function normalise(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Index of the matching hash, or -1. The caller REMOVES that hash — single use is the
 * caller's job because it must happen in the same transaction as the sign-in effect.
 */
export function matchRecoveryCode(input: string, hashes: string[]): number {
  if (!input?.trim()) return -1;
  return hashes.indexOf(hashRecoveryCode(input));
}
