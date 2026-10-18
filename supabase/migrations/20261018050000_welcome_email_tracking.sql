-- Tracks whether the one-time welcome email has been sent, so the
-- /auth/callback route (hit by both signup confirmation and password
-- reset links) only ever sends it once per account.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;
