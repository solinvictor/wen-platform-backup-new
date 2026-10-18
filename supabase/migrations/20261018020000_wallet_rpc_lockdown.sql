-- Lock down wallet/referral RPCs
--
-- The security advisor flagged wallet_credit() and credit_referral_reward()
-- as callable directly over PostgREST by anon/authenticated roles. That's
-- a real hole, not just a lint nit:
--   - wallet_credit(buyer_id, amount, reason, reference) let ANYONE credit
--     ANY buyer's wallet with ANY amount by POSTing to
--     /rest/v1/rpc/wallet_credit directly.
--   - credit_referral_reward(order_id) never checked the order was
--     actually PAID, so it could be called early (or by anyone) to pay
--     out a referral reward for an order that hadn't been paid for yet.
--
-- Fix: revoke EXECUTE from anon/authenticated (both only get called from
-- server code using the service role, which keeps its own grants), and
-- make credit_referral_reward require orders.status = 'paid'.

-- Revoking from anon/authenticated alone isn't enough — Postgres grants
-- EXECUTE to PUBLIC by default on function creation, and every role
-- (including anon/authenticated) is implicitly a member of PUBLIC, so the
-- PUBLIC grant has to be revoked directly, with service_role re-granted
-- explicitly since it's what the server-side admin client runs as.
REVOKE EXECUTE ON FUNCTION wallet_credit(uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION credit_referral_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_credit(uuid, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION credit_referral_reward(uuid) TO service_role;

CREATE OR REPLACE FUNCTION credit_referral_reward(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral   referrals%ROWTYPE;
  v_order_ref  text;
  v_amount     numeric;
  v_status     text;
  v_reward     numeric(12, 2);
BEGIN
  SELECT * INTO v_referral
  FROM referrals
  WHERE order_id = p_order_id AND status = 'pending'
  LIMIT 1;

  IF v_referral IS NULL THEN
    RETURN;
  END IF;

  SELECT order_ref, amount_total, status INTO v_order_ref, v_amount, v_status
  FROM orders WHERE id = p_order_id;

  IF v_status IS DISTINCT FROM 'paid' THEN
    RETURN; -- never pay a reward for an order that isn't actually paid
  END IF;

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
