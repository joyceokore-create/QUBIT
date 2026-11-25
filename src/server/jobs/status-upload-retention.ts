import type { Prisma } from "@prisma/client";
import type { JobDefinition } from "@/server/jobs/types";

/** Previews older than this that nobody applied are deleted, file and lines. */
export const STATUS_UPLOAD_PREVIEW_DAYS = 7;

/**
 * Drop status-report previews nobody applied after `days`. An applied upload stays: the
 * projects it was attached to read their file from it. So does one with lines sent to
 * another PM that they haven't answered (or have used). Runs under the tenant's RLS.
 */
export async function purgeStaleUploads(tx: Prisma.TransactionClient, days = STATUS_UPLOAD_PREVIEW_DAYS, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const { count } = await tx.statusUpload.deleteMany({ where: { status: "previewed", createdAt: { lt: cutoff }, documents: { none: {} }, rows: { none: { state: { in: ["routed", "accepted"] } } } } });
  return count;
}

/** Nightly, per tenant. Records the count only — never file names or content. */
export const statusUploadRetention: JobDefinition = {
  name: "status-upload-retention",
  async run(tx) {
    return { days: STATUS_UPLOAD_PREVIEW_DAYS, deleted: await purgeStaleUploads(tx) };
  },
};
