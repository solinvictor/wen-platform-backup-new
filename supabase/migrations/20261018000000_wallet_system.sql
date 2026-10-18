-- Wallet system
-- In-house cash balance per buyer, funded via Paystack. No withdrawal —
-- this is spendable credit only (used today for Paystack top-ups; the
-- referral and cashback features will credit the same ledger later).

CREATE TABLE IF NOT EXISTS wallets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL UNIQUE REFERENCES buyers(id) ON DELETE CASCADE,
  balance     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      uuid NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount        numeric(12, 2) NOT NULL CHECK (amount > 0),
  reason        text NOT NULL,
  reference     text UNIQUE,
  balance_after numeric(12, 2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_buyer_id_idx ON wallet_transactions (buyer_id, created_at DESC);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Buyers can read their own wallet and ledger. All writes go through the
-- wallet_credit() function below (called with the service role), never
-- directly from the client — so there are no INSERT/UPDATE/DELETE policies.
CREATE POLICY "buyer can view own wallet"
  ON wallets FOR SELECT
  USING (buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid()));

CREATE POLICY "buyer can view own wallet transactions"
  ON wallet_transactions FOR SELECT
  USING (buyer_id IN (SELECT id FROM buyers WHERE user_id = auth.uid()));

-- One wallet per buyer, created automatically.
CREATE OR REPLACE FUNCTION handle_new_buyer_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO wallets (buyer_id) VALUES (NEW.id)
  ON CONFLICT (buyer_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_new_buyer_wallet
  AFTER INSERT ON buyers
  FOR EACH ROW EXECUTE FUNCTION handle_new_buyer_wallet();

-- Backfill wallets for existing buyers.
INSERT INTO wallets (buyer_id)
SELECT id FROM buyers
ON CONFLICT (buyer_id) DO NOTHING;

-- Credits a buyer's wallet and writes the matching ledger row atomically.
-- Idempotent on `p_reference` — calling it twice with the same reference
-- (e.g. both the webhook and the verify fallback firing) only credits once.
CREATE OR REPLACE FUNCTION wallet_credit(
  p_buyer_id  uuid,
  p_amount    numeric,
  p_reason    text,
  p_reference text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_balance numeric(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet_credit: amount must be positive';
  END IF;

  IF p_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM wallet_transactions WHERE reference = p_reference
  ) THEN
    RETURN; -- already credited for this reference
  END IF;

  INSERT INTO wallets (buyer_id, balance)
  VALUES (p_buyer_id, p_amount)
  ON CONFLICT (buyer_id) DO UPDATE
    SET balance = wallets.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO wallet_transactions (buyer_id, type, amount, reason, reference, balance_after)
  VALUES (p_buyer_id, 'credit', p_amount, p_reason, p_reference, v_new_balance);
END;
$$;
