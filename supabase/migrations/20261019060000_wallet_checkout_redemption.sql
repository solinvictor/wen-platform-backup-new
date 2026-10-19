-- Lets the general wallet (Paystack top-ups) be applied at checkout,
-- alongside delivery_credits (20261019040000). Different rules:
--   - Wallet can cover ANY part of the order (items + delivery), not just
--     the delivery fee, and isn't capped at 25% — the buyer chooses how
--     much of their own real money to spend.
--   - Summed account-wide across every buyers row tied to this user (same
--     fragmentation as delivery credits — a new buyers row per order means
--     wallet balance already gets scattered across rows; this at least
--     makes the whole balance spendable from any one of them rather than
--     stranding it on whichever row it happened to land on).
--   - If wallet + delivery credit cover the ENTIRE order, there's nothing
--     left for Paystack — api/orders/route.ts marks that order 'paid'
--     immediately and redeems everything inline, with no payment gateway
--     step at all. Otherwise, same deferred pattern as delivery credits:
--     reserved on the order row at creation, actually debited only once
--     payment is confirmed (or immediately, for the no-gateway-needed case).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS wallet_amount_applied numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_debit_applied  boolean       NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION get_available_wallet_balance(p_user_id uuid)
RETURNS numeric LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(w.balance), 0)
  FROM wallets w
  JOIN buyers b ON b.id = w.buyer_id
  WHERE b.user_id = p_user_id AND w.balance > 0;
$$;

REVOKE EXECUTE ON FUNCTION get_available_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_available_wallet_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION redeem_wallet_applied(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer_id  uuid;
  v_user_id   uuid;
  v_applied   numeric;
  v_redeemed  boolean;
  v_order_ref text;
  v_left      numeric;
  v_take      numeric;
  r           record;
BEGIN
  SELECT buyer_id, wallet_amount_applied, wallet_debit_applied, order_ref
  INTO v_buyer_id, v_applied, v_redeemed, v_order_ref
  FROM orders WHERE id = p_order_id;

  IF v_buyer_id IS NULL OR v_redeemed OR v_applied IS NULL OR v_applied <= 0 THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id FROM buyers WHERE id = v_buyer_id;
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_left := v_applied;

  FOR r IN
    SELECT w.buyer_id, w.balance
    FROM wallets w
    JOIN buyers b ON b.id = w.buyer_id
    WHERE b.user_id = v_user_id AND w.balance > 0
    ORDER BY w.updated_at ASC
    FOR UPDATE OF w
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(r.balance, v_left);
    UPDATE wallets SET balance = balance - v_take, updated_at = now() WHERE buyer_id = r.buyer_id;
    INSERT INTO wallet_transactions (buyer_id, type, amount, reason, reference, balance_after)
    VALUES (
      r.buyer_id, 'debit', v_take,
      'Applied at checkout — order ' || COALESCE(v_order_ref, p_order_id::text),
      'WEN-WALLET-APPLY-' || COALESCE(v_order_ref, p_order_id::text) || '-' || r.buyer_id::text,
      r.balance - v_take
    )
    ON CONFLICT (reference) DO NOTHING;
    v_left := v_left - v_take;
  END LOOP;

  UPDATE orders SET wallet_debit_applied = true WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_wallet_applied(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_wallet_applied(uuid) TO service_role;
