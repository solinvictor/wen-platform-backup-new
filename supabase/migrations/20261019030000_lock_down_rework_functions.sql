-- Same PUBLIC-grant pitfall as before, but worse this time: this Supabase
-- project also grants EXECUTE directly to anon/authenticated on every new
-- function (separate from the implicit PUBLIC grant), so revoking from
-- PUBLIC alone — which was enough in 20261018020000 — left
-- credit_market_day_cashback() still callable by anon/authenticated via
-- /rest/v1/rpc. Confirmed via pg_proc.proacl and fixed by revoking from
-- all three explicitly.
REVOKE EXECUTE ON FUNCTION credit_market_day_cashback(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_market_day_cashback(uuid) TO service_role;

-- grant_signup_delivery_credit() and handle_order_delivered() are trigger
-- functions (RETURNS trigger) — Postgres won't let PostgREST call them as
-- an RPC regardless, but locking them down too for consistency with every
-- other function here.
REVOKE EXECUTE ON FUNCTION grant_signup_delivery_credit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_order_delivered() FROM PUBLIC, anon, authenticated;
