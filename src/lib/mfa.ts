import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";

// docs/11-security-compliance.md: "store the secret encrypted". AES-256-GCM with a key
// from MFA_ENCRYPTION_KEY (never the app's AUTH_SECRET — a compromised session secret
// must not also unlock stored MFA secrets).
const ALGORITHM = "aes-256-gcm";
// Tolerates +/-1 time step (30s) of clock drift between server and authenticator app.
const EPOCH_TOLERANCE = 30;

function getEncryptionKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("MFA_ENCRYPTION_KEY is not set.");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32).");
  }
  return buf;
}

/** Encrypts a TOTP secret for storage in User.mfaSecret. Format: iv:authTag:ciphertext (base64). */
export function encryptMfaSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptMfaSecret(stored: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export interface MfaEnrollment {
  secret: string;
  qrDataUrl: string;
}

/** Generates a fresh TOTP secret + QR code for enrolment. Not persisted until verified. */
export async function generateMfaEnrollment(
  accountLabel: string,
  issuer: string,
): Promise<MfaEnrollment> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer, label: accountLabel, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, qrDataUrl };
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token, epochTolerance: EPOCH_TOLERANCE });
    return result.valid;
  } catch {
    return false;
  }
}
