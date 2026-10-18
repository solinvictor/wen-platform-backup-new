-- _keepalive is an internal pg_cron ping table with no sensitive data and
-- no client use case — enabling RLS with no policies simply locks out
-- anon/authenticated entirely (the cron job runs as a role that bypasses
-- RLS), clearing the security advisor's "RLS Disabled in Public" flag.
ALTER TABLE public._keepalive ENABLE ROW LEVEL SECURITY;
