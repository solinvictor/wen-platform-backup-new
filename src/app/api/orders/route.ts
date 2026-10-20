import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getMarketDayInfo } from '@/lib/market-day'
import { haversineKm, calcDeliveryFee, WEN_HQ } from '@/lib/delivery'
import { sendEmail } from '@/lib/email'
import { orderReceiptEmail } from '@/lib/email-templates'

interface CartItem {
  id: string
  name: string
  category: string
  unit: string | null
  quantity: number
}

function genRef() {
  return 'WEN-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      fullName, phoneNumber, email, location, landmark,
      deliveryLat, deliveryLng,
      locationSource, buyerType, items, notes,
      walletAmountRequested,
    } = body as {
      fullName?: string
      phoneNumber?: string
      email?: string
      location?: string
      landmark?: string
      deliveryLat?: number | null
      deliveryLng?: number | null
      locationSource?: string
      buyerType?: string
      items?: CartItem[]
      notes?: string
      walletAmountRequested?: number
    }

    if (
      !fullName?.trim() || !phoneNumber?.trim()
      || !location?.trim() || location.trim().length < 5
      || !buyerType?.trim()
    ) {
      return NextResponse.json({ error: 'Please fill in all required fields.' }, { status: 400 })
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email for your payment receipt.' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Your list is empty — add at least one product.' }, { status: 400 })
    }
    if (locationSource !== undefined && locationSource !== 'address' && locationSource !== 'pin') {
      return NextResponse.json({ error: 'Please choose a valid delivery location.' }, { status: 400 })
    }
    if (items.some(i => !i.id)) {
      return NextResponse.json({ error: 'Something went wrong with your cart. Please refresh and try again.' }, { status: 400 })
    }
    if (typeof deliveryLat !== 'number' || typeof deliveryLng !== 'number') {
      return NextResponse.json(
        { error: 'Choose an address suggestion or add an optional map pin to calculate delivery.' },
        { status: 400 }
      )
    }
    if (
      !Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)
      || deliveryLat < -90 || deliveryLat > 90 || deliveryLng < -180 || deliveryLng > 180
    ) {
      return NextResponse.json({ error: 'Please choose a valid delivery address or map pin.' }, { status: 400 })
    }
    if (items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)) {
      return NextResponse.json({ error: 'Please check the quantities in your cart and try again.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fallback/demo items carry non-UUID placeholder ids — filter them out up front.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidItem = items.find(i => !UUID_RE.test(i.id))
    if (invalidItem) {
      return NextResponse.json(
        { error: `"${invalidItem.name}" is not available for purchase yet. Please remove it and try again.` },
        { status: 400 }
      )
    }

    // Never trust client-sent prices — look up real prices server-side.
    const { data: dbProducts, error: productsError } = await supabase
      .from('products')
      .select('id, price, is_available')
      .in('id', items.map(i => i.id))

    if (productsError) {
      console.error('[orders] product lookup failed:', productsError.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    const priceById = new Map((dbProducts ?? []).map(p => [p.id, p]))
    let itemsTotal = 0
    for (const item of items) {
      const product = priceById.get(item.id)
      if (!product || product.is_available === false || product.price == null) {
        return NextResponse.json(
          { error: `"${item.name}" is no longer available. Please remove it and try again.` },
          { status: 400 }
        )
      }
      itemsTotal += Number(product.price) * item.quantity
    }

    const marketDay = getMarketDayInfo()

    // Distance-based delivery: ₦200/km from Welfare Quarters HQ
    // 20% off delivery fee on Market Days; cashback (not a basket discount)
    // is credited separately once the order is paid — see credit_market_day_cashback().
    const distanceKm = haversineKm(WEN_HQ.lat, WEN_HQ.lng, deliveryLat, deliveryLng)
    const delivery   = calcDeliveryFee(distanceKm, marketDay.isMarketDay)

    let userId: string | null = null
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (url && key) {
        const authClient = await createClient()
        const { data: { user } } = await authClient.auth.getUser()
        userId = user?.id ?? null
      }
    } catch { /* guest checkout */ }

    // Delivery credit (signup bonus / referral bonus) — delivery-fee-only,
    // capped at 25% of THIS order's delivery fee (the pricing meeting's
    // stacking guardrail). Looked up across every buyers row tied to this
    // account, not just whichever buyer row this order creates — see
    // get_available_delivery_credit(). Guests have no persistent identity to
    // hold a credit balance against, so this is always 0 for them.
    // Reflected in amount_total immediately so Paystack charges the
    // discounted amount; only actually deducted from delivery_credits once
    // this order is confirmed paid (redeem_delivery_credits()).
    let deliveryCreditApplied = 0
    if (userId) {
      const { data: availableCredit, error: creditError } = await supabase.rpc(
        'get_available_delivery_credit',
        { p_user_id: userId }
      )
      if (creditError) {
        console.error('[orders] get_available_delivery_credit failed:', creditError.message)
      } else {
        const cap = delivery.finalFee * 0.25
        deliveryCreditApplied = Math.round(
          Math.max(0, Math.min(Number(availableCredit ?? 0), cap, delivery.finalFee)) * 100
        ) / 100
      }
    }

    // Wallet (real money, from Paystack top-ups) — unlike delivery credit,
    // this can cover ANY part of the order and isn't capped at 25%; the
    // buyer is choosing to spend their own balance. The client sends how
    // much they want applied (a toggle/amount at checkout), but the actual
    // amount is always clamped server-side to what's really available —
    // never trust the requested figure past that. Summed account-wide, same
    // as delivery credit, via get_available_wallet_balance().
    const remainingAfterCredit = Math.max(0, itemsTotal + delivery.finalFee - deliveryCreditApplied)
    let walletAmountApplied = 0
    if (userId && typeof walletAmountRequested === 'number' && walletAmountRequested > 0) {
      const { data: availableWallet, error: walletError } = await supabase.rpc(
        'get_available_wallet_balance',
        { p_user_id: userId }
      )
      if (walletError) {
        console.error('[orders] get_available_wallet_balance failed:', walletError.message)
      } else {
        walletAmountApplied = Math.round(
          Math.max(0, Math.min(walletAmountRequested, Number(availableWallet ?? 0), remainingAfterCredit)) * 100
        ) / 100
      }
    }

    const amountTotal = Math.max(0, remainingAfterCredit - walletAmountApplied)
    // True only when wallet + delivery credit cover the order in full —
    // there's nothing left for Paystack to charge, so this order skips the
    // payment gateway entirely and is paid immediately.
    const fullyPaidByCredit = amountTotal <= 0 && (deliveryCreditApplied > 0 || walletAmountApplied > 0)

    const productsInterested = items.map(i => i.name).join(', ')
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .insert({
        full_name:          fullName.trim(),
        phone_number:       phoneNumber.trim(),
        email:              email.trim(),
        location:           location.trim(),
        landmark:           landmark?.trim() || null,
        // Address-search coordinates are only an estimate for pricing. Save
        // rider-navigation coordinates only when the buyer confirmed a pin.
        delivery_lat:       locationSource === 'address' ? null : deliveryLat,
        delivery_lng:       locationSource === 'address' ? null : deliveryLng,
        buyer_type:         buyerType,
        products_interested: productsInterested,
        ...(userId ? { user_id: userId } : {}),
      })
      .select('id')
      .single()

    if (buyerError || !buyer) {
      console.error('[orders] buyer insert failed:', buyerError?.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    const productSummary = items
      .map(i => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.unit ? ` (${i.unit})` : ''}`)
      .join(', ')

    const orderRef = genRef()

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      buyer_id:                 buyer.id,
      product_summary:          productSummary,
      notes:                    notes?.trim() || null,
      delivery_type:            'standard',
      delivery_fee:             delivery.finalFee,
      delivery_distance_km:     delivery.distanceKm,
      delivery_discount_amount: delivery.discount,
      market_day:               marketDay.marketDay,
      discount_amount:          0,
      delivery_credit_applied:  deliveryCreditApplied,
      wallet_amount_applied:    walletAmountApplied,
      expected_delivery_date:   marketDay.deliveryDate,
      order_ref:                orderRef,
      amount_total:             amountTotal,
      status:                   fullyPaidByCredit ? 'paid' : 'pending_payment',
    }).select('id').single()

    if (orderError || !order) {
      console.error('[orders] order insert failed:', orderError?.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    // No Paystack step for this order (wallet + delivery credit covered it
    // in full) — so nothing will ever call paystack-verify/webhook to do
    // the usual post-payment redemption. Do it right here instead, same
    // functions, same idempotency guards.
    if (fullyPaidByCredit) {
      if (deliveryCreditApplied > 0) {
        const { error } = await supabase.rpc('redeem_delivery_credits', { p_order_id: order.id })
        if (error) console.error('[orders] redeem_delivery_credits (fully-paid) failed:', error.message)
      }
      if (walletAmountApplied > 0) {
        const { error } = await supabase.rpc('redeem_wallet_applied', { p_order_id: order.id })
        if (error) console.error('[orders] redeem_wallet_applied (fully-paid) failed:', error.message)
      }
      if (marketDay.marketDay) {
        const { error } = await supabase.rpc('credit_market_day_cashback', { p_order_id: order.id })
        if (error) console.error('[orders] credit_market_day_cashback (fully-paid) failed:', error.message)
      }

      // No Paystack redirect will happen for this order, so this is the
      // only chance to send the receipt — paystack-verify/webhook never
      // fire for an order with nothing left to charge.
      const { subject, html } = orderReceiptEmail({
        orderRef, productSummary, amountTotal,
        deliveryFee: delivery.finalFee,
        deliveryCreditApplied, walletAmountApplied,
        expectedDeliveryDate: marketDay.deliveryDate,
      })
      try {
        await sendEmail({ to: email.trim(), subject, html })
      } catch (err) {
        console.error('[orders] receipt email (fully-paid) failed:', err)
      }
    }

    // --- Referral tracking ---
    // Attribution is permanent, stored on the account (profiles.referred_by_user_id)
    // the first time a valid referral code is used, and never cleared — every
    // future order from this account checks it fresh and earns referral
    // cashback, not just the first one. The wen_ref cookie only matters for
    // establishing that attribution in the first place; once it's set, the
    // cookie is irrelevant. Guests have no persistent account to attach this
    // to, so referral tracking is a no-op for them, same as before.
    if (userId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('referred_by_user_id')
          .eq('id', userId)
          .single()

        let referrerUserId: string | null = profile?.referred_by_user_id ?? null
        let codeUsed = 'ACCOUNT_LINKED' // true for every order after the first

        if (!referrerUserId) {
          const refCode = req.cookies.get('wen_ref')?.value?.trim().toUpperCase()
          if (refCode) {
            const { data: referrerBuyer } = await supabase
              .from('buyers')
              .select('user_id')
              .eq('referral_code', refCode)
              .single()

            if (referrerBuyer?.user_id && referrerBuyer.user_id !== userId) {
              await supabase
                .from('profiles')
                .update({ referred_by_user_id: referrerBuyer.user_id })
                .eq('id', userId)
              referrerUserId = referrerBuyer.user_id
              codeUsed = refCode // this is the order that actually established attribution
            }
          }
        }

        if (referrerUserId) {
          // referrer_id on the referrals row is a buyers.id FK — any current
          // row for that account works, since wallet_credit() resolves it
          // back to the account's single canonical wallet, not this row.
          const { data: referrerBuyerRow } = await supabase
            .from('buyers')
            .select('id')
            .eq('user_id', referrerUserId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (referrerBuyerRow) {
            // 'pending' until the order is actually delivered —
            // credit_referral_reward() (fired by a DB trigger on orders
            // when status flips to 'delivered') flips this to 'converted'
            // and pays the referrer then. One row per order now, not one
            // ever — this is what makes the cashback recurring.
            await supabase.from('referrals').insert({
              referrer_id: referrerBuyerRow.id,
              referred_id: buyer.id,
              order_id:    order.id,
              code_used:   codeUsed,
              status:      'pending',
            })
          }
        }
      } catch (refErr) {
        // Non-fatal — order still goes through
        console.error('[orders] referral tracking failed:', refErr)
      }
    }

    const response = NextResponse.json({
      success:              true,
      orderRef,
      amountTotal,
      discountAmount:       0,
      deliveryFee:          delivery.finalFee,
      deliveryDistanceKm:   delivery.distanceKm,
      deliveryDiscount:     delivery.discount,
      deliveryCreditApplied,
      walletAmountApplied,
      fullyPaidByCredit,
      expectedDeliveryDate: marketDay.deliveryDate,
      email:                email.trim(),
    })

    // Clear the referral cookie — it's been used (or wasn't valid); don't credit twice
    response.cookies.set('wen_ref', '', { maxAge: 0, path: '/' })

    return response
  } catch (err) {
    console.error('[orders] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
