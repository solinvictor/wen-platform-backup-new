-- Market Day moves from Tuesday/Friday to Wednesday/Saturday.
-- Mirrors the app-level change in src/lib/market-day.ts — without this,
-- every market-day order insert fails at the DB check constraint
-- (same bug class as orders_status_check / products_category_check).

ALTER TABLE orders DROP CONSTRAINT orders_market_day_check;
ALTER TABLE orders ADD CONSTRAINT orders_market_day_check
  CHECK (market_day = ANY (ARRAY['Wednesday'::text, 'Saturday'::text]));
