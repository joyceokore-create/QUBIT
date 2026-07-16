-- Encrypted access token for live connectors (never stored in plaintext; see src/lib/secret-box.ts).
ALTER TABLE "project_integration" ADD COLUMN "secret" TEXT;
