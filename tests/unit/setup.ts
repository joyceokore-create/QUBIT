import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";

// Q's LLM provider must never be reached from tests (real network calls to the internal AI
// box → non-deterministic + slow). We can't just strip the env once: importing `@/lib/db`
// pulls in Prisma, which auto-loads `.env` via dotenv AFTER setupFiles run — repopulating
// Q_AI_API_KEY. So we blank the credentials in a global beforeAll, which runs after all
// module imports, guaranteeing every suite takes the deterministic/mock offline path. A
// test that wants the model sets these in its OWN beforeAll (which runs after this one) and
// mocks `fetch` — see tests/unit/q-llm.test.ts.
beforeAll(() => {
  delete process.env.Q_AI_API_KEY;
  delete process.env.Q_AI_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});
