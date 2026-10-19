import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** Wallet funding amount bounds, in naira */
const MIN_WALLET_FUNDING = 100
const MAX_WALLET_FUNDING = 500_000

/**
 * Starts a Paystack checkout for one of:
 *  - a one-time order (orderRef) — the original flow
 *  - a subscription's first, tokenizing payment (subscriptionId) — the
 *    reusable authorization captured from THIS charge is what the daily
 *    cron uses to charge future deliveries automatically
 *  - a wallet top-up (fundWallet + amount) — the only case where the
 *    client supplies an amount; it's clamped and the buyer is read from
 *    the authenticated session, never trusted from the body otherwise
 *
 * Never trusts anything the client sends beyond which record to charge for
 * — amount and email are always re-read from the database (or, for wallet
 * funding, from the authenticated session + a clamped client-supplied
 * amount).
 *
 * Reuses the monnify_email / monnify_card_token / setup_payment_reference
 * columns added during the brief Monnify era rather than renaming anything
 * back — Paystack's metadata survives the webhook round trip reliably, so
 * setup_payment_reference isn't load-bearing here the way it was for
 * Monnify, but it's kept in sync anyway in case anything else still reads it.
 *
 * Body: { orderRef: string } OR { subscriptionId: string } OR { fundWallet: true, amount: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderRef?: string
      subscriptionId?: string
      fundWallet?: boolean
      amount?: number
    }
    const { orderRef, subscriptionId, fundWallet, amount } = body

    if (!orderRef?.trim() && !subscriptionId?.trim() && !fundWallet) {
      return NextResponse.json({ error: 'Missing order or subscription reference.' }, { status: 400 })
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      console.error('[paystack-initialize] PAYSTACK_SECRET_KEY is not set')
      return NextResponse.json({ error: 'Payments are not configured yet. Please try again later.' }, { status: 500 })
    }

    const supabase = createAdminClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`

    let email: string
    let amountKobo: number
    let reference: string
    let callbackPath: string
    let metadata: Record<string, unknown>

    if (orderRef?.trim()) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status, amount_total, buyer_id, buyers(email)')
        .eq('order_ref', orderRef.trim())
        .single()

      if (orderError || !order) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
      }
      if (order.status !== 'pending_payment') {
        return NextResponse.json({ error: 'This order has already been paid or is no longer payable.' }, { status: 409 })
      }
      if (!order.amount_total || order.amount_total <= 0) {
        return NextResponse.json({ error: 'This order has no payable amount.' }, { status: 400 })
      }

      const buyerRow = Array.isArray(order.buyers) ? order.buyers[0] : order.buyers
      if (!buyerRow?.email) {
        return NextResponse.json({ error: 'Could not find an email for this order.' }, { status: 400 })
      }

      email = buyerRow.email
      amountKobo = Math.round(Number(order.amount_total) * 100)
      reference = orderRef.trim()
      callbackPath = '/checkout/callback'
      metadata = { kind: 'order', order_ref: orderRef.trim(), order_id: order.id }
    } else if (fundWallet) {
      const sessionClient = await createClient()
      const { data: { user } } = await sessionClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Please log in to fund your wallet.' }, { status: 401 })
      }

      const amountNum = Number(amount)
      if (!Number.isFinite(amountNum) || amountNum < MIN_WALLET_FUNDING || amountNum > MAX_WALLET_FUNDING) {
        return NextResponse.json({
          error: `Enter an amount between ₦${MIN_WALLET_FUNDING.toLocaleString('en-NG')} and ₦${MAX_WALLET_FUNDING.toLocaleString('en-NG')}.`,
        }, { status: 400 })
      }

      let { data: buyer } = await supabase
        .from('buyers')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // A buyer row today is only ever created when someone places an
      // order — there's no signup-time trigger for it. Someone who signs
      // up and goes straight to funding their wallet (without ordering
      // first) would otherwise hit a dead end here, so create a minimal
      // buyer record on the fly instead of failing. They can fill in
      // real delivery details later at checkout.
      if (!buyer) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>
        const metaName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
        const metaPhone = typeof meta.phone === 'string' ? meta.phone.trim() : ''

        const { data: newBuyer, error: createError } = await supabase
          .from('buyers')
          .insert({
            user_id: user.id,
            full_name: metaName || (user.email?.split('@')[0] ?? 'WEN buyer'),
            phone_number: metaPhone || 'Not provided',
            email: user.email ?? '',
            status: 'pending',
          })
          .select('id')
          .single()

        if (createError || !newBuyer) {
          console.error('[paystack-initialize] failed to auto-create buyer for wallet funding:', createError?.message)
          return NextResponse.json({ error: 'Could not set up your buyer account. Please try again.' }, { status: 500 })
        }

        buyer = newBuyer
      }

      email = user.email ?? ''
      if (!email) {
        return NextResponse.json({ error: 'Your account has no email on file.' }, { status: 400 })
      }

      amountKobo = Math.round(amountNum * 100)
      reference = `WEN-WALLET-${buyer.id}-${Date.now().toString(36).toUpperCase()}`
      callbackPath = '/account/wallet-callback'
      metadata = { kind: 'wallet_funding', buyer_id: buyer.id, amount: amountNum }
    } else {
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select('id, status, quantity, product_id, monnify_email, products(price)')
        .eq('id', subscriptionId!.trim())
        .single()

      if (subError || !sub) {
        return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 })
      }
      if (sub.status !== 'pending_first_payment') {
        return NextResponse.json({ error: 'This subscription has already been activated.' }, { status: 409 })
      }
      if (!sub.monnify_email) {
        return NextResponse.json({ error: 'Missing email for this subscription.' }, { status: 400 })
      }

      const productRow = Array.isArray(sub.products) ? sub.products[0] : sub.products
      const price = productRow?.price
      if (price == null) {
        return NextResponse.json({ error: 'This product no longer has a price set.' }, { status: 400 })
      }

      email = sub.monnify_email
      amountKobo = Math.round(Number(price) * sub.quantity * 100)
      reference = `WEN-SUB-${sub.id}-${Date.now().toString(36).toUpperCase()}`
      callbackPath = '/subscribe/callback'
      metadata = { kind: 'subscription_setup', subscription_id: sub.id }

      // Kept in sync for anything else still reading this column; Paystack
      // itself routes the webhook by metadata, not this reference.
      const { error: refError } = await supabase
        .from('subscriptions')
        .update({ setup_payment_reference: reference })
        .eq('id', sub.id)
      if (refError) {
        console.error('[paystack-initialize] failed to store setup_payment_reference:', refError.message)
        return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 500 })
      }
    }

    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        callback_url: `${siteUrl}${callbackPath}`,
        metadata,
      }),
    })

    const psData = await psRes.json()
    if (!psRes.ok || !psData?.status) {
      console.error('[paystack-initialize] Paystack rejected the request:', psData?.message)
      return NextResponse.json({ error: psData?.message || 'Could not start payment. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({
      authorizationUrl: psData.data.authorization_url,
      accessCode: psData.data.access_code,
      reference: psData.data.reference,
    })
  } catch (err) {
    console.error('[paystack-initialize] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
