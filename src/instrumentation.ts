// Runs once on server boot (Next.js instrumentation hook). In the production container the
// entrypoint runs `prisma migrate deploy` first, then `node server.js` — so by the time this
// fires the schema exists, and we mirror the code catalogue (src/lib/catalogue.ts) into the
// global app_module/permission tables. This is the deploy-time sync (tuma's on-boot seeder),
// and it also keeps local dev current on every restart. Idempotent and cheap.
export async function register() {
  // Only the Node runtime can reach Prisma; skip the edge runtime pass.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("@/lib/db");
    const { syncCatalogue } = await import("@/server/catalogue-sync");
    const result = await syncCatalogue(prisma);
    console.log(
      `[qubit] catalogue synced: ${result.modules} modules, ${result.permissions} permissions` +
        (result.deactivated ? `, ${result.deactivated} deactivated` : ""),
    );
  } catch (e) {
    // Never block server startup on the catalogue sync (tuma does the same). A stale
    // catalogue degrades the browse UI, not enforcement — can() reads session strings.
    console.error("[qubit] catalogue sync failed — continuing startup:", e);
  }
}
