-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('NEW', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "access_request" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "job_title" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'NEW',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_request_status_created_at_idx" ON "access_request"("status", "created_at");
