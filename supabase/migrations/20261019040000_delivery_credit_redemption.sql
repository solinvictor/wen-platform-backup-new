-- Redemption for delivery_credits (signup bonus + market-day cashback),
-- which 20261019020000 accrued but never let anyone spend. This migration
-- is the "next piece" flagged there.
--
-- Flow:
--   1. At order creation (api/orders/route.ts), the server looks up the
--      buyer's available, unexpired delivery credit across ALL of their
--      buyers rows (one user accumulates a new buyers row per order — see
--      20261019020000's comments) and applies up to 25% of that order's
--      delivery fee against it (the meeting's stacking guardrail). This is
--      reflected in amount_total immediately, so the buyer pays the
--      discounted amount at Paystack.
--   2. The applied amount is only ever actually deducted from
--      delivery_credits once the order is confirmed PAID (same moment
--      credit_market_day_cashback() already runs, in paystack-verify and
--      the webhook) — not at order creation, since a lot of orders never
--      get paid (abandoned checkout). redeem_delivery_credits() does this,
--      FIFO by soonest-to-expire, row-locked against concurrent redemption.
--   3. Idempotent via orders.delivery_credit_redeemed — guards the same
--      double-webhook-delivery case credit_market_day_cashback already
--      has to handle.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_credit_applied  numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_credit_redeemed boolean       NOT NULL DEFAULT false;

-- ── Fix: the delivery_credits SELECT policy from 20261019020000 was dead
-- on arrival. buyers has no SELECT policy for ordinary users (only "Admins
-- can manage buyers"), so the policy's own subquery against buyers
-- (`buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid())`) was
-- itself blocked by RLS and always returned zero rows — meaning no buyer
-- could ever see their own delivery credits via the client, the policy's
-- only reason to exist. A SECURITY DEFINER helper bypasses that, the same
-- way the rest of this feature's functions already run as definer.
CREATE OR REPLACE FUNCTION is_own_buyer(p_buyer_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM buyers WHERE id = p_buyer_id AND user_id = auth.uid()
  );
$$;

-- Callable by anyone (it only answers "is this buyer row yours?", and is
-- invoked automatically whenever the delivery_credits policy below is
-- evaluated) — unlike the service-role-only functions elsewhere in this
-- feature.
REVOKE EXECUTE ON FUNCTION is_own_buyer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_own_buyer(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "buyer can view own delivery credits" ON delivery_credits;
CREATE POLICY "buyer can view own delivery credits"
  ON delivery_credits FOR SELECT
  USING (is_own_buyer(buyer_id));

-- ── Available balance, summed across every buyers row tied to this account ──
CREATE OR REPLACE FUNCTION get_available_delivery_credit(p_user_id uuid)
RETURNS numeric LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(dc.remaining), 0)
  FROM delivery_credits dc
  JOIN buyers b ON b.id = dc.buyer_id
  WHERE b.user_id = p_user_id
    AND dc.remaining > 0
    AND dc.expires_at > now();
$$;

REVOKE EXECUTE ON FUNCTION get_available_delivery_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_available_delivery_credit(uuid) TO service_role;

-- ── Actually spend it, once an order is confirmed paid ──────────────────────
CREATE OR REPLACE FUNCTION redeem_delivery_credits(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer_id  uuid;
  v_user_id   uuid;
  v_applied   numeric;
  v_redeemed  boolean;
  v_left      numeric;
  v_take      numeric;
  r           record;
BEGIN
  SELECT buyer_id, delivery_credit_applied, delivery_credit_redeemed
  INTO v_buyer_id, v_applied, v_redeemed
  FROM orders WHERE id = p_order_id;

  IF v_buyer_id IS NULL OR v_redeemed OR v_applied IS NULL OR v_applied <= 0 THEN
    RETURN; -- nothing was applied to this order, or already redeemed
  END IF;

  SELECT user_id INTO v_user_id FROM buyers WHERE id = v_buyer_id;
  IF v_user_id IS NULL THEN
    RETURN; -- guest order — credit should never have been applied, but don't touch anything if it was
  END IF;

  v_left := v_applied;

  FOR r IN
    SELECT dc.id, dc.remaining
    FROM delivery_credits dc
    JOIN buyers b ON b.id = dc.buyer_id
    WHERE b.user_id = v_user_id
      AND dc.remaining > 0
      AND dc.expires_at > now()
    ORDER BY dc.expires_at ASC
    FOR UPDATE OF dc
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(r.remaining, v_left);
    UPDATE delivery_credits SET remaining = remaining - v_take WHERE id = r.id;
    v_left := v_left - v_take;
  END LOOP;

  -- Mark redeemed even if a race left less available than was applied at
  -- checkout (e.g. two tabs, same account) — this still only ever runs
  -- once per order, so it can never double-redeem on a webhook retry.
  UPDATE orders SET delivery_credit_redeemed = true WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_delivery_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_delivery_credits(uuid) TO service_role;
