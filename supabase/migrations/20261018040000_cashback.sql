-- Cashback
-- 2% of the final amount paid (after discounts, including delivery fee)
-- credited to the buyer's own wallet on every paid order. Idempotent on
-- reference via wallet_credit(), same as referral rewards — safe to call
-- from both the webhook and the verify fallback.

CREATE OR REPLACE FUNCTION credit_order_cashback(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_ref text;
  v_amount    numeric;
  v_status    text;
  v_buyer_id  uuid;
  v_cashback  numeric(12, 2);
BEGIN
  SELECT order_ref, amount_total, status, buyer_id
  INTO v_order_ref, v_amount, v_status, v_buyer_id
  FROM orders WHERE id = p_order_id;

  IF v_buyer_id IS NULL OR v_status IS DISTINCT FROM 'paid' THEN
    RETURN; -- only ever pay cashback on an order that's actually paid
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN;
  END IF;

  v_cashback := ROUND(v_amount * 0.02, 2);

  PERFORM wallet_credit(
    v_buyer_id,
    v_cashback,
    'Cashback — order ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-CASHBACK-' || COALESCE(v_order_ref, p_order_id::text)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION credit_order_cashback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credit_order_cashback(uuid) TO service_role;
