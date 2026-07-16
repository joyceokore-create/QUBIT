import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (integration access tokens, etc.).
 * Keyed on INTEGRATION_ENCRYPTION_KEY, falling back to MFA_ENCRYPTION_KEY so existing
 * deployments work without a new secret. Never store a provider token in plaintext.
 * Format: iv:authTag:ciphertext (base64), same shape as src/lib/mfa.ts.
 */
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY (or MFA_ENCRYPTION_KEY) is not set.");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("Encryption key must decode to 32 bytes (openssl rand -base64 32).");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
