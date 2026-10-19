-- The real fix for the wallet-shows-0 bug that just bit the owner twice in
-- one evening: wallets (and wallet_transactions) were keyed by buyer_id,
-- and buyers gets a BRAND NEW row every single order (see
-- 20261019020000's comments) — so a wallet's money was always stranded on
-- whichever buyer row happened to exist when it was credited, and the
-- account page only ever shows the newest buyer row's wallet. Every
-- returning customer who funds their wallet, then places another order,
-- would see ₦0 and think their money vanished.
--
-- Real fix: a wallet belongs to the ACCOUNT (auth.users), not to an order's
-- buyer row. Add wallets.user_id / wallet_transactions.user_id, consolidate
-- any balance currently split across buyer rows onto one row per account,
-- enforce one wallet per account going forward, and read/write by user_id
-- from here on. buyer_id is kept (still NOT NULL, still useful for "which
-- order/buyer row first created this") but is no longer what anything is
-- looked up by for a logged-in account.
--
-- Guest checkout (no account) has no persistent identity across orders —
-- there's nothing to consolidate for a guest, so that path keeps working
-- exactly as before, keyed by buyer_id, with user_id left null. In
-- practice no guest has ever had a wallet (funding requires being signed
-- in), but this keeps that path correct rather than assuming it away.

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

UPDATE wallets w SET user_id = b.user_id
FROM buyers b WHERE b.id = w.buyer_id AND w.user_id IS NULL AND b.user_id IS NOT NULL;

UPDATE wallet_transactions wt SET user_id = b.user_id
FROM buyers b WHERE b.id = wt.buyer_id AND wt.user_id IS NULL AND b.user_id IS NOT NULL;

-- Consolidate: every account keeps exactly one wallet row (the one with
-- the highest balance, ties broken by oldest), carrying the SUM of
-- whatever was scattered across its other buyer rows. The others are
-- drained to 0 and removed — their wallet_transactions history stays
-- (that table has its own rows, untouched by deleting a wallets row).
WITH ranked AS (
  SELECT id, user_id, balance,
         row_number() OVER (PARTITION BY user_id ORDER BY balance DESC, created_at ASC) AS rn
  FROM wallets WHERE user_id IS NOT NULL
),
totals AS (
  SELECT user_id, sum(balance) AS total FROM wallets WHERE user_id IS NOT NULL GROUP BY user_id
)
UPDATE wallets w SET balance = t.total, updated_at = now()
FROM ranked r, totals t
WHERE w.id = r.id AND r.rn = 1 AND t.user_id = r.user_id;

-- The redundant rows aren't deleted (just drained to 0 and detached from
-- the account by nulling user_id) — their wallet_transactions history is
-- untouched either way, and this keeps the migration side-effect-free to
-- re-run.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY balance DESC, created_at ASC) AS rn
  FROM wallets WHERE user_id IS NOT NULL
)
UPDATE wallets w SET balance = 0, user_id = NULL, updated_at = now()
FROM ranked r
WHERE w.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_key ON wallets (user_id) WHERE user_id IS NOT NULL;

-- ── wallet_credit: one wallet per ACCOUNT, looked up/created by user_id,
-- not by whichever buyer row (order) triggered the credit. p_buyer_id is
-- now only "which buyer row first created this wallet" — informational,
-- never used for lookup again. Guest checkout (no account) keeps the old
-- buyer_id-keyed behavior, since there's no persistent identity to
-- consolidate against.
CREATE OR REPLACE FUNCTION wallet_credit(p_buyer_id uuid, p_amount numeric, p_reason text, p_reference text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid;
  v_new_balance numeric(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet_credit: amount must be positive';
  END IF;

  IF p_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM wallet_transactions WHERE reference = p_reference
  ) THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id FROM buyers WHERE id = p_buyer_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO wallets (buyer_id, user_id, balance)
    VALUES (p_buyer_id, v_user_id, p_amount)
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE
      SET balance = wallets.balance + EXCLUDED.balance,
          updated_at = now()
    RETURNING balance INTO v_new_balance;

    INSERT INTO wallet_transactions (buyer_id, user_id, type, amount, reason, reference, balance_after)
    VALUES (p_buyer_id, v_user_id, 'credit', p_amount, p_reason, p_reference, v_new_balance);
  ELSE
    INSERT INTO wallets (buyer_id, balance)
    VALUES (p_buyer_id, p_amount)
    ON CONFLICT (buyer_id) DO UPDATE
      SET balance = wallets.balance + EXCLUDED.balance,
          updated_at = now()
    RETURNING balance INTO v_new_balance;

    INSERT INTO wallet_transactions (buyer_id, type, amount, reason, reference, balance_after)
    VALUES (p_buyer_id, 'credit', p_amount, p_reason, p_reference, v_new_balance);
  END IF;
END;
$$;

-- ── Available balance: now a trivial single-row lookup — no more summing
-- across scattered rows, because there's only ever one row per account.
CREATE OR REPLACE FUNCTION get_available_wallet_balance(p_user_id uuid)
RETURNS numeric LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(balance, 0) FROM wallets WHERE user_id = p_user_id;
$$;

-- ── Spend whatever was applied at checkout, once payment is confirmed —
-- same simplification, single-row debit instead of a FIFO loop.
CREATE OR REPLACE FUNCTION redeem_wallet_applied(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer_id  uuid;
  v_user_id   uuid;
  v_applied   numeric;
  v_redeemed  boolean;
  v_order_ref text;
  v_balance   numeric;
  v_take      numeric;
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

  SELECT balance INTO v_balance FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL THEN
    UPDATE orders SET wallet_debit_applied = true WHERE id = p_order_id;
    RETURN;
  END IF;

  v_take := LEAST(v_balance, v_applied);

  UPDATE wallets SET balance = balance - v_take, updated_at = now() WHERE user_id = v_user_id;

  INSERT INTO wallet_transactions (buyer_id, user_id, type, amount, reason, reference, balance_after)
  VALUES (
    v_buyer_id, v_user_id, 'debit', v_take,
    'Applied at checkout — order ' || COALESCE(v_order_ref, p_order_id::text),
    'WEN-WALLET-APPLY-' || COALESCE(v_order_ref, p_order_id::text),
    v_balance - v_take
  )
  ON CONFLICT (reference) DO NOTHING;

  UPDATE orders SET wallet_debit_applied = true WHERE id = p_order_id;
END;
$$;

-- ── Fix: "buyer can view own wallet[/transactions]" had the exact same
-- dead-on-arrival bug as delivery_credits' policy (20261019040000) — its
-- subquery against buyers was itself blocked by buyers' own RLS (no SELECT
-- policy for ordinary users), so it always returned zero rows. No account
-- has ever been able to see its own wallet via the client. Now that
-- wallets/wallet_transactions carry user_id directly, this needs no
-- buyers subquery (and no SECURITY DEFINER helper) at all.
ALTER POLICY "buyer can view own wallet" ON wallets USING (user_id = auth.uid());
ALTER POLICY "buyer can view own wallet transactions" ON wallet_transactions USING (user_id = auth.uid());
