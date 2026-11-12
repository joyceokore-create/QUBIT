import bcrypt from "bcryptjs";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

export { PASSWORD_MIN_LENGTH };

// NFR-04 / docs/11-security-compliance.md: no reuse of last 3 hashes. Minimum length raised
// from 8 to 12 (UX fidelity D-F8, 2026-11-11) — applies when a password is set or changed;
// existing passwords keep working. Security team informed via the backend notes.
const SALT_ROUNDS = 12;
const MIN_LENGTH = PASSWORD_MIN_LENGTH;
const HISTORY_SIZE = 3;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  return null;
}

/** Checks a new password against the user's last HISTORY_SIZE password hashes. */
export async function isPasswordReused(
  password: string,
  previousHashes: string[],
): Promise<boolean> {
  const recent = previousHashes.slice(-HISTORY_SIZE);
  for (const hash of recent) {
    if (await bcrypt.compare(password, hash)) return true;
  }
  return false;
}

/** Appends the current hash to history, trimmed to HISTORY_SIZE, for use on password change. */
export function pushPasswordHistory(previousHashes: string[], currentHash: string): string[] {
  return [...previousHashes, currentHash].slice(-HISTORY_SIZE);
}
