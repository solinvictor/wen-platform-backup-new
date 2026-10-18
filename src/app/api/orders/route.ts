import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateMarketDayDiscount, getMarketDayInfo } from '@/lib/market-day'
import { haversineKm, calcDeliveryFee, WEN_HQ } from '@/lib/delivery'

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

    // Market Day — 10% off product subtotal (unchanged)
    const marketDay = getMarketDayInfo()
    const marketDayDiscount = calculateMarketDayDiscount(itemsTotal, marketDay)

    // Distance-based delivery: ₦300/km from Welfare Quarters HQ
    // 20% off delivery fee on Market Days (separate from the product discount)
    const distanceKm = haversineKm(WEN_HQ.lat, WEN_HQ.lng, deliveryLat, deliveryLng)
    const delivery   = calcDeliveryFee(distanceKm, marketDay.isMarketDay)

    const amountTotal = itemsTotal - marketDayDiscount + delivery.finalFee

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
      discount_amount:          marketDayDiscount,
      expected_delivery_date:   marketDay.deliveryDate,
      order_ref:                orderRef,
      amount_total:             amountTotal,
      status:                   'pending_payment',
    }).select('id').single()

    if (orderError || !order) {
      console.error('[orders] order insert failed:', orderError?.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    // --- Referral tracking ---
    const refCode = req.cookies.get('wen_ref')?.value?.trim().toUpperCase()
    if (refCode) {
      try {
        const { data: referrer } = await supabase
          .from('buyers')
          .select('id')
          .eq('referral_code', refCode)
          .single()

        if (referrer && referrer.id !== buyer.id) {
          // 'pending' until the order is actually paid — credit_referral_reward()
          // (called from the Paystack webhook/verify) flips this to 'converted'
          // and pays the referrer then, so an abandoned cart never earns a reward.
          await supabase.from('referrals').insert({
            referrer_id: referrer.id,
            referred_id: buyer.id,
            order_id:    order.id,
            code_used:   refCode,
            status:      'pending',
          })
        }
      } catch (refErr) {
        // Non-fatal — order still goes through
        console.error('[orders] referral insert failed:', refErr)
      }
    }

    const response = NextResponse.json({
      success:              true,
      orderRef,
      amountTotal,
      discountAmount:       marketDayDiscount,
      deliveryFee:          delivery.finalFee,
      deliveryDistanceKm:   delivery.distanceKm,
      deliveryDiscount:     delivery.discount,
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
