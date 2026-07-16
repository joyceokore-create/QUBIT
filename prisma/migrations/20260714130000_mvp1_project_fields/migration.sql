-- MVP1 PRD Module 2 — additional project definition fields (all nullable, back-compat).
ALTER TABLE "project" ADD COLUMN "client" TEXT;
ALTER TABLE "project" ADD COLUMN "objective" TEXT;
ALTER TABLE "project" ADD COLUMN "mission" TEXT;
ALTER TABLE "project" ADD COLUMN "business_owner" TEXT;
ALTER TABLE "project" ADD COLUMN "start_date" TIMESTAMP(3);
