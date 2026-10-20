-- Rebalance which rewards are withdrawable, per owner's correction:
-- only the flat BONUSES (signup, referral) stay non-withdrawable
-- delivery credit. Everything else that's actually "cashback" —
-- Market Day cashback and the tiered referral cashback — is real,
-- withdrawable wallet money.
--
--   Signup bonus (₦500)        → delivery credit (unchanged)
--   Referral bonus (₦250 flat) → delivery credit (MOVED from wallet)
--   Market Day cashback (5%)   → wallet            (MOVED from delivery credit)
--   Referral cashback (tiered) → wallet (unchanged — already there)

ALTER TABLE delivery_credits DROP CONSTRAINT delivery_credits_source_check;
ALTER TABLE delivery_credits ADD CONSTRAINT delivery_credits_source_check
  CHECK (source = ANY (ARRAY['signup_bonus'::text, 'market_day_cashback'::text, 'referral_bonus'::text]));

-- Market Day cashback now pays into the withdrawable wallet instead of
-- delivery credit. No more expiry, no more 25%-of-delivery-fee cap —
-- it's just cash now, same as everything else in the wallet.
CREATE OR REPLACE FUNCTION credit_market_day_cashback(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount     numeric;
  v_status     text;
  v_buyer_id   uuid;
  v_market_day text;
  v_order_ref  text;
  v_cashback   numeric(12, 2);
BEGIN
  SELECT amount_total, status, buyer_id, market_day, order_ref
  INTO v_amount, v_status, v_buyer_id, v_market_day, v_order_ref
  FROM orders WHERE id = p_order_id;

  IF v_buyer_id IS NULL OR v_status IS DISTINCT FROM 'paid' THEN
    RETURN;
  END IF;

  IF v_market_day IS NULL THEN
    RETURN;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN;
  END IF;

  v_cashback := LEAST(ROUND(v_amount * 0.05, 2), 500);

  PERFORM wallet_credit(
    v_buyer_id,
    v_cashback,
    'Market Day cashback (5%) — order ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-MDCB-' || COALESCE(v_order_ref, p_order_id::text)
  );
END;
$$;

-- Referral bonus now pays into delivery credit instead of the wallet —
-- the tiered referral cashback just below it still pays into the wallet,
-- unchanged.
CREATE OR REPLACE FUNCTION credit_referral_reward(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral          referrals%ROWTYPE;
  v_order_ref         text;
  v_amount            numeric;
  v_pct               numeric;
  v_reward            numeric(12, 2);
  v_bonus             numeric(12, 2) := 250.00;
  v_referred_user_id  uuid;
  v_bonus_paid        boolean;
BEGIN
  SELECT * INTO v_referral
  FROM referrals
  WHERE order_id = p_order_id AND status = 'pending'
  LIMIT 1;

  IF v_referral IS NULL THEN
    RETURN;
  END IF;

  SELECT order_ref, amount_total INTO v_order_ref, v_amount
  FROM orders WHERE id = p_order_id;

  SELECT b.user_id INTO v_referred_user_id FROM buyers b WHERE b.id = v_referral.referred_id;

  IF v_referred_user_id IS NOT NULL THEN
    SELECT referral_bonus_paid INTO v_bonus_paid FROM profiles WHERE id = v_referred_user_id;
    IF v_bonus_paid IS NOT TRUE THEN
      INSERT INTO delivery_credits (buyer_id, amount, remaining, source, order_id, expires_at)
      VALUES (v_referral.referrer_id, v_bonus, v_bonus, 'referral_bonus', p_order_id, now() + interval '30 days');

      UPDATE profiles SET referral_bonus_paid = true WHERE id = v_referred_user_id;
    END IF;
  END IF;

  -- Tiered cashback — still real wallet money, unchanged.
  IF v_amount IS NOT NULL AND v_amount >= 1000 THEN
    v_pct := CASE
      WHEN v_amount >= 50000 THEN 0.05
      WHEN v_amount >= 20000 THEN 0.03
      WHEN v_amount >= 10000 THEN 0.02
      ELSE 0.01
    END;
    v_reward := ROUND(v_amount * v_pct, 2);

    PERFORM wallet_credit(
      v_referral.referrer_id,
      v_reward,
      'Referral cashback (' || (v_pct * 100)::int || '%) — order ' || COALESCE(v_order_ref, p_order_id::text),
      'WEN-REF-' || COALESCE(v_order_ref, p_order_id::text)
    );
  END IF;

  UPDATE referrals
  SET status = 'converted', converted_at = now()
  WHERE id = v_referral.id AND status = 'pending';
END;
$$;
