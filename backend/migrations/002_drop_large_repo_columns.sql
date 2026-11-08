-- Scanning repos over 200 MB without their large files was removed.
ALTER TABLE scans DROP COLUMN skip_large, DROP COLUMN skipped;
