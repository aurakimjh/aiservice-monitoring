-- Phase 27: StorageBackend abstraction — rename S3-specific columns
-- to generic storage path columns that support s3://, file://, etc.

BEGIN;

ALTER TABLE collect_results RENAME COLUMN s3_key TO evidence_storage_path;

ALTER TABLE terminal_sessions RENAME COLUMN s3_log_key TO log_storage_path;

COMMIT;
