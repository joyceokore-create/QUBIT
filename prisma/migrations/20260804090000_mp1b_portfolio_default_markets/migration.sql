-- M-P1b (docs/27) — Rollout portfolios remember which markets the wizard picked, so the
-- project wizard can pre-fill. Column-only; no DML, no backfill (NULL = none set).
ALTER TABLE "portfolio" ADD COLUMN "default_markets" JSONB;
