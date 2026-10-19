import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Defensive fallback for wallet top-ups (the webhook is the primary path,
 * same as for orders). Independently re-checks the transaction with
 * Paystack before crediting — never trusts the redirect or the client.
 * wallet_credit() is idempotent on reference, so this is safe to call
 * even if the webhook already landed.
 */
async function verifyWalletFunding(
  supabase: ReturnType<typeof createAdminClient>,
  secretKey: string,
  reference: string,
) {
  const { data: existing } = await supabase
    .from('wallet_transactions')
    .select('id, balance_after')
    .eq('reference', reference)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ paid: true, walletFunded: true })
  }

  const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const psData = await psRes.json()

  if (!psRes.ok || !psData?.status || psData.data?.status !== 'success') {
    return NextResponse.json({ paid: false, error: psData?.message || 'Payment was not successful.' })
  }

  const buyerId = psData.data?.metadata?.buyer_id
  const amountKobo = psData.data?.amount
  if (!buyerId || !amountKobo) {
    console.error('[paystack-verify] wallet_funding verify missing buyer_id or amount for', reference)
    return NextResponse.json({ paid: false, error: 'Could not confirm this top-up.' })
  }

  const { error: creditError } = await supabase.rpc('wallet_credit', {
    p_buyer_id: buyerId,
    p_amount: amountKobo / 100,
    p_reason: 'Paystack wallet top-up',
    p_reference: reference,
  })

  if (creditError) {
    console.error('[paystack-verify] wallet_credit failed:', creditError.message)
    return NextResponse.json({ paid: false, error: 'Could not credit your wallet. Please try again.' })
  }

  return NextResponse.json({ paid: true, walletFunded: true })
}

/**
 * Called by the checkout callback page after Paystack redirects the buyer
 * back. This does NOT trust the redirect happened — it independently asks
 * Paystack whether the transaction actually succeeded, and only then
 * (defensively — the webhook is the primary path) marks the order paid.
 * Safe to call multiple times: idempotent on order.status.
 *
 * Reuses the monnify_transaction_reference column from the brief Monnify
 * era rather than renaming anything back — see paystack-initialize.
 */
export async function POST(req: NextRequest) {
  try {
    const { reference } = (await req.json()) as { reference?: string }
    if (!reference?.trim()) {
      return NextResponse.json({ error: 'Missing reference.' }, { status: 400 })
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 500 })
    }

    const supabase = createAdminClient()

    // Wallet top-ups don't create an `orders` row — route by reference
    // prefix before falling into the order-lookup path below.
    if (reference.trim().startsWith('WEN-WALLET-')) {
      return verifyWalletFunding(supabase, secretKey, reference.trim())
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, amount_total, order_ref, product_summary, delivery_type, delivery_fee')
      .eq('order_ref', reference.trim())
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    // Already confirmed (likely by the webhook, which is the primary path) —
    // just return the current state, don't re-verify with Paystack again.
    if (order.status === 'paid') {
      return NextResponse.json({ paid: true, order })
    }

    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.trim())}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    const psData = await psRes.json()

    if (!psRes.ok || !psData?.status) {
      return NextResponse.json({ paid: false, error: psData?.message || 'Could not verify payment.' })
    }

    const expectedKobo = Math.round(Number(order.amount_total) * 100)
    const isSuccessful = psData.data?.status === 'success' && psData.data?.amount === expectedKobo

    if (!isSuccessful) {
      if (order.status === 'pending_payment') {
        await supabase.from('orders').update({ status: 'payment_failed' }).eq('id', order.id)
      }
      return NextResponse.json({ paid: false, error: 'Payment was not successful.' })
    }

    if (order.status === 'pending_payment') {
      await supabase
        .from('orders')
        .update({ status: 'paid', monnify_transaction_reference: reference.trim() })
        .eq('id', order.id)

      // Referral reward is no longer paid here — it only pays out once the
      // order reaches status = 'delivered' (a DB trigger on orders handles
      // that transition). Market day cashback, though, is tied to payment.
      const { error: cashbackError } = await supabase.rpc('credit_market_day_cashback', { p_order_id: order.id })
      if (cashbackError) {
        console.error('[paystack-verify] credit_market_day_cashback failed:', cashbackError.message)
      }

      // Spend whatever delivery credit / wallet balance was applied at
      // checkout — reserved on the order row since creation, actually
      // deducted only now that payment is confirmed.
      const { error: redeemError } = await supabase.rpc('redeem_delivery_credits', { p_order_id: order.id })
      if (redeemError) {
        console.error('[paystack-verify] redeem_delivery_credits failed:', redeemError.message)
      }
      const { error: walletRedeemError } = await supabase.rpc('redeem_wallet_applied', { p_order_id: order.id })
      if (walletRedeemError) {
        console.error('[paystack-verify] redeem_wallet_applied failed:', walletRedeemError.message)
      }
    }

    return NextResponse.json({ paid: true, order: { ...order, status: 'paid' } })
  } catch (err) {
    console.error('[paystack-verify] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
