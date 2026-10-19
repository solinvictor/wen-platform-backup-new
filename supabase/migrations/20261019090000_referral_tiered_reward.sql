-- Referral reward rework, per owner's latest business-rule round:
--   1. Flat ₦250 "referral signup bonus" (50% of the new buyer's ₦500
--      signup bonus) paid to the referrer once, the same moment their
--      referral converts.
--   2. The old flat 5% ongoing-order reward is replaced by a tiered
--      percentage of THAT SAME (first/converting) order's amount:
--        ₦1,000–9,999   → 1%
--        ₦10,000–19,999 → 2%
--        ₦20,000–49,999 → 3%  (no distinct 30k–50k tier — owner said
--                               to leave that gap as-is, so it simply
--                               inherits the 20k tier through to 50k)
--        ₦50,000+       → 5%
--        under ₦1,000   → 0% (no reward, bonus still pays)
--      Payout stays one-time-per-referral (on first conversion only) —
--      the existing architecture deliberately self-destructs a referral
--      link after one conversion (see /api/orders/route.ts), and the
--      "up to 5% on all your referral purchases" phrasing was given to
--      me explicitly as marketing copy, not a literal recurring-payout
--      spec, so this keeps the lower-risk one-time design rather than
--      rewriting referral tracking into a permanent per-order link.
--
-- Also fixes the SAME dead-on-arrival RLS bug found twice already this
-- session (delivery_credits, wallets): "referrer can view own referrals"
-- filtered on a subquery against `buyers`, which has no SELECT policy for
-- ordinary users, so the subquery always returned zero rows and no user
-- has ever been able to see their own referrals via the client.

CREATE OR REPLACE FUNCTION credit_referral_reward(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral   referrals%ROWTYPE;
  v_order_ref  text;
  v_amount     numeric;
  v_pct        numeric;
  v_reward     numeric(12, 2);
  v_bonus      numeric(12, 2) := 250.00;
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

  -- Flat signup bonus pays regardless of order size (it's a reward for
  -- the referral converting at all, not for the order amount).
  PERFORM wallet_credit(
    v_referral.referrer_id,
    v_bonus,
    'Referral signup bonus — ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-REFBONUS-' || COALESCE(v_order_ref, p_order_id::text)
  );

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

-- Fix dead-on-arrival RLS (buyers has no SELECT policy for ordinary users,
-- so a subquery against it from another table's policy always empties out).
ALTER POLICY "referrer can view own referrals"
  ON referrals
  USING (is_own_buyer(referrer_id));
