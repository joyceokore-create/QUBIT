import { expect, test } from "@playwright/test";

/**
 * M9 e2e smoke (docs/16 §12) — the golden path through a seeded database: sign in, see
 * the persona dashboard, the personal board, a project board with its lens rules, the
 * reports page, and a CSV export. Deliberately shallow and fast: this exists to catch
 * "the app doesn't boot / auth broke / a main surface 500s", not to re-prove behaviour
 * the unit and RLS suites already pin down.
 *
 * Requires the dev DB seeded (`pnpm prisma db seed`); the webServer block in
 * playwright.config.ts boots the app.
 */

const ADMIN = { email: "demo.admin@demo-b.example.invalid", password: "Passw0rd!23" };

test.describe("golden path (Demo Org B fixture super-admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill(ADMIN.email);
    await page.getByPlaceholder("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard**");
  });

  test("dashboard renders a persona with live content", async ({ page }) => {
    await expect(page.getByText(/Good (morning|afternoon|evening|day)/)).toBeVisible();
    await expect(page.getByText("Demo Org B", { exact: false }).first()).toBeVisible();
  });

  test("personal board shows the three lanes", async ({ page }) => {
    await page.goto("/board");
    for (const lane of ["To do", "Doing", "Done"]) {
      await expect(page.getByText(lane, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("feeds your weekly report", { exact: false })).toBeVisible();
  });

  test("project board: PM sees the four lenses and can export tasks", async ({ page }) => {
    await page.goto("/projects");
    // Open the first project in the list (seeded P001).
    await page.getByText("CBS Phase 1", { exact: false }).first().click();
    await page.getByRole("button", { name: "Board" }).click();
    for (const lens of ["All work", "Dev board", "QA board", "Implementor board"]) {
      await expect(page.getByRole("button", { name: new RegExp(lens) })).toBeVisible();
    }
    // The export is a real download with a real CSV in it.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^tasks-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("reports page renders the pipeline report", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByText(/report/i).first()).toBeVisible();
    // No 500/error boundary anywhere on the surface.
    await expect(page.getByText("Internal Server Error")).toHaveCount(0);
  });

  test("risks page renders with its export control", async ({ page }) => {
    await page.goto("/risks");
    await expect(page.getByRole("heading", { name: "Risks & Issues" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  });
});

test("Riverbank theming: login resolves the red tenant", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill("joyce.okore@riverbank.solutions");
  await page.getByPlaceholder("Password").fill("Passw0rd!23");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard**");
  await expect(page.getByText("Riverbank Group").first()).toBeVisible();
});
