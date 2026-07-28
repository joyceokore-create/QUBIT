-- Role dashboards M1a (docs/17 §1): declared user groups + landing persona persistence,
-- and the escalations column the 4th exec KPI reads its WoW delta from. Purely additive
-- DDL with defaults — no DML, so the DM1.18 production RLS gotcha cannot bite.

ALTER TABLE "user" ADD COLUMN "user_groups" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user" ADD COLUMN "primary_group" TEXT;
ALTER TABLE "user" ADD COLUMN "last_persona" TEXT;

ALTER TABLE "portfolio_snapshot" ADD COLUMN "escalations_open" INTEGER NOT NULL DEFAULT 0;
