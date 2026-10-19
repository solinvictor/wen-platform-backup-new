-- Reworks cashback/referral/signup-bonus per the Oct 19 pricing meeting:
--
--   - Market day cashback: 5% of order total (was flat 2% on every paid
--     order), capped at ₦500/order, only on orders actually placed as a
--     market-day order, paid as a DELIVERY-FEE-ONLY credit that expires in
--     30 days (was: unrestricted, non-expiring general wallet credit).
--   - New-signup credit: ₦500, delivery-fee-only, expires in 14 days.
--     NOTE: the meeting notes tie this to "a verified phone number to stop
--     fake accounts" — there is no phone-verification system anywhere in
--     this codebase yet (checked: no OTP/verify flow exists), so that gate
--     is NOT enforced here. This grants on every real account signup
--     unconditionally. Flagged for a follow-up once phone verification
--     exists.
--   - Referral reward: 1% of the referred order (was 5%), paid out only
--     once that order reaches status = 'delivered' (was: as soon as it was
--     paid), as an ordinary (unrestricted, non-expiring) wallet credit —
--     the notes don't restrict this one to delivery fees. The referral
--     "self-destructs once the cycle completes": once a referred_id has
--     ever converted, no further referral row is created for that same
--     referred buyer.
--
-- General wallet credit (wallets/wallet_transactions, used for Paystack
-- top-ups) is untouched. This adds a PARALLEL ledger, delivery_credits,
-- for money that can only ever be spent against a delivery fee line and
-- that expires — something the general wallet has no concept of.
--
-- Redeeming delivery_credits at checkout (capped at 25% of that order's
-- delivery fee, per the meeting's stacking guardrail) is NOT part of this
-- migration — credits accrue correctly here, but nothing spends them yet.
-- That's the next piece.

CREATE TABLE IF NOT EXISTS delivery_credits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  remaining   numeric(12, 2) NOT NULL CHECK (remaining >= 0),
  source      text NOT NULL CHECK (source IN ('signup_bonus', 'market_day_cashback')),
  order_id    uuid REFERENCES orders(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One cashback grant per order, at most.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_credits_order_cashback_uq
  ON delivery_credits (order_id)
  WHERE source = 'market_day_cashback';

CREATE INDEX IF NOT EXISTS delivery_credits_buyer_id_idx
  ON delivery_credits (buyer_id, expires_at);

ALTER TABLE delivery_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer can view own delivery credits"
  ON delivery_credits FOR SELECT
  USING (buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid()));

-- ── Market day cashback — now a delivery-fee-only, expiring credit ─────────
CREATE OR REPLACE FUNCTION credit_market_day_cashback(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount    numeric;
  v_status    text;
  v_buyer_id  uuid;
  v_market_day text;
  v_cashback  numeric(12, 2);
BEGIN
  SELECT amount_total, status, buyer_id, market_day
  INTO v_amount, v_status, v_buyer_id, v_market_day
  FROM orders WHERE id = p_order_id;

  IF v_buyer_id IS NULL OR v_status IS DISTINCT FROM 'paid' THEN
    RETURN; -- only ever pay cashback on an order that's actually paid
  END IF;

  IF v_market_day IS NULL THEN
    RETURN; -- not a market-day order — no cashback
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN;
  END IF;

  v_cashback := LEAST(ROUND(v_amount * 0.05, 2), 500);

  INSERT INTO delivery_credits (buyer_id, amount, remaining, source, order_id, expires_at)
  VALUES (v_buyer_id, v_cashback, v_cashback, 'market_day_cashback', p_order_id, now() + interval '30 days')
  ON CONFLICT (order_id) WHERE source = 'market_day_cashback' DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION credit_market_day_cashback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credit_market_day_cashback(uuid) TO service_role;

-- The old flat 2%-on-every-order credit_order_cashback() function still
-- exists in the DB but nothing calls it anymore as of this migration —
-- left in place rather than dropped (no functional risk either way).

-- ── New-signup delivery credit ──────────────────────────────────────────────
-- Granted once per real account (keyed by auth user id, not by buyers.id —
-- a single person accumulates a NEW buyers row per order today, so keying
-- this to buyers.id directly would re-grant ₦500 on every single order).
CREATE OR REPLACE FUNCTION grant_signup_delivery_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW; -- guest checkout — nothing to tie a one-time signup bonus to
  END IF;

  IF EXISTS (
    SELECT 1
    FROM delivery_credits dc
    JOIN buyers b ON b.id = dc.buyer_id
    WHERE b.user_id = NEW.user_id AND dc.source = 'signup_bonus'
  ) THEN
    RETURN NEW; -- this account already got its one signup bonus
  END IF;

  INSERT INTO delivery_credits (buyer_id, amount, remaining, source, expires_at)
  VALUES (NEW.id, 500, 500, 'signup_bonus', now() + interval '14 days');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grant_signup_delivery_credit
  AFTER INSERT ON buyers
  FOR EACH ROW EXECUTE FUNCTION grant_signup_delivery_credit();

-- ── Referral reward — 1% (was 5%), paid on delivery (was: on payment) ──────
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

  IF v_status IS DISTINCT FROM 'delivered' THEN
    RETURN; -- only pay out once the referred order is actually delivered
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN;
  END IF;

  v_reward := ROUND(v_amount * 0.01, 2);

  PERFORM wallet_credit(
    v_referral.referrer_id,
    v_reward,
    'Referral reward — order ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-REF-' || COALESCE(v_order_ref, p_order_id::text)
  );

  -- Terminal: this referred buyer has now converted once. The referral
  -- "self-destructs" — orders/route.ts checks for this status before ever
  -- inserting another pending row for the same referred_id.
  UPDATE referrals
  SET status = 'converted', converted_at = now()
  WHERE id = v_referral.id AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION credit_referral_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credit_referral_reward(uuid) TO service_role;

-- Fire credit_referral_reward automatically when an order's status flips to
-- 'delivered' — this happens from admin/orders and the rider app, both of
-- which update the row directly from the client, with no server route to
-- hook into. A DB trigger is the only reliable place to catch this.
CREATE OR REPLACE FUNCTION handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    PERFORM credit_referral_reward(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_delivered
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION handle_order_delivered();
