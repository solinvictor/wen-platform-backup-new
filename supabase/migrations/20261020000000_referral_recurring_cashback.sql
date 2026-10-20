-- Make referral cashback recurring (pays on EVERY order the referred
-- account ever places), not just the first one, per owner's correction:
-- "Get up to 5% on all your referral purchases" was meant literally.
--
-- The old design couldn't do this even if it wanted to: referral
-- attribution lived in a one-shot `wen_ref` cookie, consumed and cleared
-- after the first order, with a cross-buyer-row scan in /api/orders to
-- stop it firing twice. There was nowhere durable to remember "this
-- account was referred by X" past that first order.
--
-- Fix: store that attribution permanently on the account (profiles),
-- set once and never cleared. Every future order looks it up fresh —
-- no cookie involved after the first time. The flat ₦250 signup bonus
-- still pays exactly once per account (tracked by a flag, not by the
-- referral row's one-shot status). The tiered cashback has no such
-- gate — it pays on every qualifying paid order, forever.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS referral_bonus_paid boolean NOT NULL DEFAULT false;

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
    RETURN; -- this order has no referral row (not from a referred account)
  END IF;

  SELECT order_ref, amount_total INTO v_order_ref, v_amount
  FROM orders WHERE id = p_order_id;

  -- Flat signup bonus — once per referred ACCOUNT, ever (not per order).
  SELECT b.user_id INTO v_referred_user_id FROM buyers b WHERE b.id = v_referral.referred_id;

  IF v_referred_user_id IS NOT NULL THEN
    SELECT referral_bonus_paid INTO v_bonus_paid FROM profiles WHERE id = v_referred_user_id;
    IF v_bonus_paid IS NOT TRUE THEN
      PERFORM wallet_credit(
        v_referral.referrer_id,
        v_bonus,
        'Referral signup bonus — ' || COALESCE(v_order_ref, p_order_id::text),
        'WEN-REFBONUS-' || v_referred_user_id::text
      );
      UPDATE profiles SET referral_bonus_paid = true WHERE id = v_referred_user_id;
    END IF;
  END IF;

  -- Tiered cashback — pays on THIS order, no per-account cap or gate.
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
