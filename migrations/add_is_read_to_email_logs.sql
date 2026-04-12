-- Add is_read column to email_logs.
-- Existing rows default to true (already read by user before this feature was added).
-- After the column is created with DEFAULT true, the default is changed to false
-- so that new incoming emails are unread by default.

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE email_logs
  ALTER COLUMN is_read SET DEFAULT false;
