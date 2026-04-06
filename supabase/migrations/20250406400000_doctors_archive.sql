-- Add archive support to doctors table
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS archive_reason text;
