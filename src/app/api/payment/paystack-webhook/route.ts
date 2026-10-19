import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

interface PaystackAuthorization {
  authorization_code?: string
  reusable?: boolean
}

interface PaystackChargeEvent {
  event?: string
  data?: {
    reference?: string
    status?: string
    amount?: number
    metadata?: { kind?: string; order_ref?: string; order_id?: string; subscription_id?: string; buyer_id?: string; amount?: number }
    authorization?: PaystackAuthorization
  }
}

/**
 * Paystack calls this after every transaction event. We only act on
 * charge.success, and only after verifying the request genuinely came
 * from Paystack via the X-Paystack-Signature header — never trust the
 * body alone, since anyone could POST a fake "success" otherwise.
 *
 * Reuses the monnify_transaction_reference / monnify_card_token columns
 * from the brief Monnify era rather than renaming anything back — see
 * paystack-initialize for why. Paystack's metadata survives the webhook
 * round trip reliably (unlike Monnify's), so routing is by metadata.kind
 * as it originally was, not by setup_payment_reference.
 *
 * Three distinct charge.success shapes land here:
 *  1. A one-time order payment              -> mark that order paid
 *  2. A subscription's first, tokenizing payment -> activate the
 *     subscription and store the reusable authorization_code
 *  3. A recurring charge the daily cron triggered -> mark the order
 *     that charge was for as paid (cron creates the order first,
 *     same as a normal checkout would)
 */
export async function POST(req: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) {
    console.error('[paystack-webhook] PAYSTACK_SECRET_KEY is not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  const expectedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex')

  if (
    !signature ||
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    console.error('[paystack-webhook] signature mismatch — rejecting')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: PaystackChargeEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Always 200 back to Paystack once the signature is valid, even for
  // events we don't act on — they retry on non-2xx responses.
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true })
  }

  const reference = event.data?.reference
  if (!reference) {
    return NextResponse.json({ received: true })
  }

  const supabase = createAdminClient()
  const kind = event.data?.metadata?.kind

  // ── Subscription's first, tokenizing payment ──────────────────────────
  if (kind === 'subscription_setup') {
    const subscriptionId = event.data?.metadata?.subscription_id
    if (!subscriptionId) {
      console.error('[paystack-webhook] subscription_setup event missing subscription_id')
      return NextResponse.json({ received: true })
    }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status, frequency_days')
      .eq('id', subscriptionId)
      .single()

    if (!sub || sub.status !== 'pending_first_payment') {
      // Already activated, or doesn't exist — idempotent no-op.
      return NextResponse.json({ received: true })
    }

    const auth = event.data?.authorization
    if (!auth?.authorization_code || auth.reusable !== true) {
      console.error('[paystack-webhook] subscription first charge did not return a reusable authorization:', subscriptionId)
      await supabase.from('subscriptions').update({ status: 'payment_issue' }).eq('id', subscriptionId)
      return NextResponse.json({ received: true })
    }

    const nextDelivery = new Date()
    nextDelivery.setDate(nextDelivery.getDate() + sub.frequency_days)

    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        monnify_card_token: auth.authorization_code,
        next_delivery_date: nextDelivery.toISOString().slice(0, 10),
      })
      .eq('id', subscriptionId)

    return NextResponse.json({ received: true })
  }

  // ── Wallet top-up ───────────────────────────────────────────────────
  if (kind === 'wallet_funding') {
    const buyerId = event.data?.metadata?.buyer_id
    const amountKobo = event.data?.amount
    if (!buyerId || !amountKobo) {
      console.error('[paystack-webhook] wallet_funding event missing buyer_id or amount')
      return NextResponse.json({ received: true })
    }

    const { error: creditError } = await supabase.rpc('wallet_credit', {
      p_buyer_id: buyerId,
      p_amount: amountKobo / 100,
      p_reason: 'Paystack wallet top-up',
      p_reference: reference,
    })

    if (creditError) {
      console.error('[paystack-webhook] wallet_credit failed:', creditError.message)
    }

    return NextResponse.json({ received: true })
  }

  // ── One-time order, or a recurring charge the cron triggered ─────────
  // Both create a real `orders` row up front with order_ref === reference,
  // so this lookup covers either case identically.
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, amount_total')
    .eq('order_ref', reference)
    .single()

  if (fetchError || !order) {
    console.error('[paystack-webhook] no matching order for reference:', reference)
    return NextResponse.json({ received: true })
  }

  // Idempotency: Paystack can send the same event more than once.
  if (order.status === 'paid') {
    return NextResponse.json({ received: true })
  }

  // Sanity check: the amount actually charged (in kobo) must match what we
  // expected to charge, so a stale/mismatched webhook can't mark an order
  // paid for the wrong amount.
  const expectedKobo = Math.round(Number(order.amount_total) * 100)
  if (event.data?.amount !== expectedKobo) {
    console.error(
      '[paystack-webhook] amount mismatch for', reference,
      'expected', expectedKobo, 'got', event.data?.amount
    )
    await supabase.from('orders').update({ status: 'payment_failed' }).eq('id', order.id)
    return NextResponse.json({ received: true })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'paid', monnify_transaction_reference: reference })
    .eq('id', order.id)

  if (updateError) {
    console.error('[paystack-webhook] failed to mark order paid:', updateError.message)
  } else {
    // Referral reward is no longer paid here — it only pays out once the
    // order reaches status = 'delivered' (a DB trigger on orders handles
    // that transition). Market day cashback, though, is tied to payment.
    const { error: cashbackError } = await supabase.rpc('credit_market_day_cashback', { p_order_id: order.id })
    if (cashbackError) {
      console.error('[paystack-webhook] credit_market_day_cashback failed:', cashbackError.message)
    }
  }

  return NextResponse.json({ received: true })
}
