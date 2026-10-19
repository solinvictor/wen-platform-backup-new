-- orders_status_check only ever allowed the OLD rider/admin status vocabulary
-- ('pending', 'matched', 'in_progress', 'delivered', 'cancelled') — it never
-- included the payment-flow statuses ('pending_payment', 'paid',
-- 'payment_failed') that api/orders/route.ts, paystack-verify, and the
-- paystack-webhook have used all along. Every single checkout attempt was
-- failing at order creation ("new row for relation orders violates check
-- constraint orders_status_check") with no way to place an order at all —
-- admin/orders/page.tsx already has the correct, full status union typed out
-- (`'pending_payment' | 'payment_failed' | 'paid' | 'pending' | 'matched' |
-- 'in_progress' | 'delivered' | 'cancelled'`), the DB constraint just never
-- matched it. Pre-existing bug, unrelated to delivery credits — just
-- surfaced because this is the first real checkout attempt since whenever
-- this constraint was last touched.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY[
  'pending_payment'::text, 'payment_failed'::text, 'paid'::text,
  'pending'::text, 'matched'::text, 'in_progress'::text, 'delivered'::text, 'cancelled'::text
]));
