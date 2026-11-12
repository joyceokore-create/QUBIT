import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";

// Q's LLM provider must never be reached from tests (real network calls to the internal AI
// box → non-deterministic + slow). We can't just strip the env once: importing `@/lib/db`
// pulls in Prisma, which auto-loads `.env` via dotenv AFTER setupFiles run — repopulating
// Q_AI_API_KEY. So we blank the credentials in a global beforeAll, which runs after all
// module imports, guaranteeing every suite takes the deterministic/mock offline path. A
// test that wants the model sets these in its OWN beforeAll (which runs after this one) and
// mocks `fetch` — see tests/unit/q-llm.test.ts.
//
// Same for Entra SSO: the config-level strip in vitest.config.ts is undone by that same
// Prisma `.env` reload, so a local .env with AZURE_AD_* set would flip createUser to the
// SSO path (users provisioned ACTIVE, no invite token) and break the credentials-based
// invite suites. Blank them here too; a test that wants SSO stubs them with vi.stubEnv.
beforeAll(() => {
  delete process.env.Q_AI_API_KEY;
  delete process.env.Q_AI_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AZURE_AD_CLIENT_ID;
  delete process.env.AZURE_AD_CLIENT_SECRET;
  delete process.env.AZURE_AD_TENANT_ID;
});
