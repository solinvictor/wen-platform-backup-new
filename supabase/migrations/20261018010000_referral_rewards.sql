-- Referral rewards
-- Pays the referrer 5% of the referred buyer's order total, in-wallet,
-- the moment that order is actually PAID (not at order creation — a
-- referral row is created 'pending' by /api/orders and only flips to
-- 'converted' + gets paid out here, so an abandoned/unpaid cart never
-- earns a reward).

ALTER TABLE referrals
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION credit_referral_reward(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral   referrals%ROWTYPE;
  v_order_ref  text;
  v_amount     numeric;
  v_reward     numeric(12, 2);
BEGIN
  SELECT * INTO v_referral
  FROM referrals
  WHERE order_id = p_order_id AND status = 'pending'
  LIMIT 1;

  IF v_referral IS NULL THEN
    RETURN; -- no pending referral for this order
  END IF;

  SELECT order_ref, amount_total INTO v_order_ref, v_amount
  FROM orders WHERE id = p_order_id;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN;
  END IF;

  v_reward := ROUND(v_amount * 0.05, 2);

  PERFORM wallet_credit(
    v_referral.referrer_id,
    v_reward,
    'Referral reward — order ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-REF-' || COALESCE(v_order_ref, p_order_id::text)
  );

  UPDATE referrals
  SET status = 'converted', converted_at = now()
  WHERE id = v_referral.id AND status = 'pending';
END;
$$;
