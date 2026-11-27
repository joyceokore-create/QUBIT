-- Plan Phase 3: the Lumi run that read an upload, when Lumi read it.
ALTER TABLE "status_upload" ADD COLUMN "extractor_run_id" TEXT;
