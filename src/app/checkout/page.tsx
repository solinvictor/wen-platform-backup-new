'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import { CATEGORY_IMAGES } from '@/lib/category-images'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import {
  ChevronLeft, ShoppingBag, Loader2, Truck,
  Phone, MapPin, User, FileText, Navigation, Mail, CalendarDays, Check,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { MarketDayBanner } from '@/components/MarketDayBanner'
import { getMarketDayInfo, type MarketDayInfo } from '@/lib/market-day'
import { haversineKm, calcDeliveryFee, isWithinServiceArea, SERVICE_AREA_LABEL, WEN_HQ, type DeliveryCalc } from '@/lib/delivery'
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete'
import { validatePhone } from '@/lib/validate'

const LocationMapPicker = lazy(() => import('@/components/LocationMapPicker'))

function fmt(n: number | null) {
  if (n == null) return '—'
  return '₦' + n.toLocaleString('en-NG')
}

interface FormData {
  fullName: string
  phone: string
  email: string
  address: string
  addressDetails: string
  landmark: string
  notes: string
  buyerType: 'household' | 'business' | 'restaurant'
}

type LocationSource = 'address' | 'pin' | null

const BUYER_TYPES = [
  { value: 'household',   label: 'Household'  },
  { value: 'business',    label: 'Business'   },
  { value: 'restaurant',  label: 'Restaurant' },
] as const

export default function CheckoutPage() {
  const router = useRouter()
  const { cartLines, cartCount, cartTotal } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm]             = useState<FormData>({
    fullName: '', phone: '', email: '', address: '', addressDetails: '', landmark: '', notes: '', buyerType: 'household',
  })
  const [errors, setErrors]         = useState<Partial<FormData>>({})
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationSource, setLocationSource] = useState<LocationSource>(null)
  const [showMap, setShowMap]       = useState(false)
  const [marketDay, setMarketDay]   = useState<MarketDayInfo | null>(null)
  const [wantsMarketDay, setWantsMarketDay] = useState(false)
  const [deliveryCalc, setDeliveryCalc] = useState<DeliveryCalc | null>(null)
  const [availableCredit, setAvailableCredit] = useState(0)
  const [walletBalance, setWalletBalance]     = useState(0)
  const [useWallet, setUseWallet]             = useState(false)
  const [walletAmountInput, setWalletAmountInput] = useState('')

  useEffect(() => {
    if (cartCount === 0) router.replace('/store')
  }, [cartCount, router])

  useEffect(() => {
    setMarketDay(getMarketDayInfo())
  }, [])

  // Preview-only — the server independently recomputes and applies both of
  // these at order creation (api/orders/route.ts). Silently 0 for guests /
  // on error.
  useEffect(() => {
    fetch('/api/account/delivery-credits')
      .then(res => res.json())
      .then(data => {
        setAvailableCredit(Number(data?.available ?? 0))
        setWalletBalance(Number(data?.walletBalance ?? 0))
      })
      .catch(() => {})
  }, [])

  // Recalculate delivery fee whenever the selected address, pin, or market-day state changes
  useEffect(() => {
    if (!deliveryCoords) { setDeliveryCalc(null); return }
    const distKm = haversineKm(WEN_HQ.lat, WEN_HQ.lng, deliveryCoords.lat, deliveryCoords.lng)
    setDeliveryCalc(calcDeliveryFee(distKm, wantsMarketDay))
  }, [deliveryCoords, wantsMarketDay])

  const hasPrices         = cartLines.some(l => l.price)
  const deliveryFee       = deliveryCalc?.finalFee ?? null
  // Preview of the 25%-of-delivery-fee stacking guardrail — the server is
  // the source of truth for the actual amount charged.
  const deliveryCreditApplied = deliveryFee != null
    ? Math.round(Math.max(0, Math.min(availableCredit, deliveryFee * 0.25, deliveryFee)) * 100) / 100
    : 0
  const remainingAfterCredit = hasPrices && deliveryFee != null
    ? Math.max(0, (cartTotal ?? 0) + deliveryFee - deliveryCreditApplied)
    : null
  // What the wallet toggle can actually cover — capped by balance and by
  // what's left after delivery credit. The server clamps independently;
  // this is only for what the buyer sees before submitting.
  const walletMaxApplicable = remainingAfterCredit != null
    ? Math.min(walletBalance, remainingAfterCredit)
    : 0
  const walletRequested = useWallet
    ? (walletAmountInput.trim() === '' ? walletMaxApplicable : Number(walletAmountInput))
    : 0
  const walletAmountApplied = remainingAfterCredit != null
    ? Math.round(Math.max(0, Math.min(walletRequested, walletMaxApplicable)) * 100) / 100
    : 0
  const grandTotal        = hasPrices && deliveryFee != null
    ? (cartTotal ?? 0) + deliveryFee - deliveryCreditApplied - walletAmountApplied
    : null

  // Order fields appear on the page top-to-bottom — used to scroll/focus
  // the first invalid one when validation fails.
  const FIELD_ORDER: Array<{ key: keyof FormData; id: string }> = [
    { key: 'fullName', id: 'checkout-name' },
    { key: 'phone',    id: 'checkout-phone' },
    { key: 'email',    id: 'checkout-email' },
    { key: 'address',  id: 'checkout-address' },
  ]

  function focusFirstError(e: Partial<FormData>) {
    const first = FIELD_ORDER.find(f => e[f.key])
    if (!first) return
    const el = document.getElementById(first.id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Wait for the smooth-scroll to settle a beat before focusing, so
    // mobile keyboards don't pop up mid-scroll and fight it.
    window.setTimeout(() => {
      if (el instanceof HTMLElement) el.focus({ preventScroll: true })
    }, 300)
  }

  function validate(): boolean {
    const e: Partial<FormData> = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 2) e.fullName = 'Enter your full name'
    const phoneErr = validatePhone(form.phone)
    if (phoneErr) e.phone = phoneErr
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email — we\'ll send your receipt here'
    if (!form.address.trim() || form.address.trim().length < 5) {
      e.address = 'Enter the recipient’s delivery address or area'
    } else if (!deliveryCoords) {
      e.address = 'Choose an address suggestion or add a map pin to calculate delivery'
    }
    if (deliveryCoords && !deliveryCalc) {
      e.address = 'Delivery fee is still calculating — please wait a moment'
    }
    setErrors(e)
    if (Object.keys(e).length > 0) focusFirstError(e)
    return Object.keys(e).length === 0
  }

  function handleAddressChange(address: string) {
    setForm(current => ({ ...current, address }))
    setDeliveryCoords(null)
    setLocationSource(null)
    setErrors(current => ({ ...current, address: undefined }))
  }

  function handleAddressSelect(suggestion: AddressSuggestion) {
    if (!isWithinServiceArea(suggestion.lat, suggestion.lng)) {
      setDeliveryCoords(null)
      setLocationSource(null)
      setErrors(current => ({
        ...current,
        address: `Delivery isn't available there yet — we currently deliver within ${SERVICE_AREA_LABEL}, and we'll be expanding soon.`,
      }))
      return
    }
    setDeliveryCoords({ lat: suggestion.lat, lng: suggestion.lng })
    setLocationSource('address')
    setErrors(current => ({ ...current, address: undefined }))
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName:    form.fullName,
          phoneNumber: form.phone,
          email:       form.email,
          location:    [form.address.trim(), form.addressDetails.trim()].filter(Boolean).join(', '),
          landmark:    form.landmark,
          locationSource,
          deliveryLat: deliveryCoords?.lat ?? null,
          deliveryLng: deliveryCoords?.lng ?? null,
          buyerType:   form.buyerType,
          notes:       form.notes,
          items: cartLines.map(l => ({
            id: l.id, name: l.name, category: l.category, unit: l.unit,
            quantity: l.quantity,
          })),
          walletAmountRequested: useWallet ? walletAmountApplied : 0,
          marketDayOptIn: wantsMarketDay,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong. Try again.'); return }

      // Wallet + delivery credit covered the whole order — nothing for
      // Paystack to charge. The server already marked it paid and redeemed
      // everything; go straight to the same confirmation screen a real
      // Paystack redirect would land on (it already knows how to handle an
      // order that's already 'paid').
      if (data.fullyPaidByCredit) {
        router.push(`/checkout/callback?reference=${encodeURIComponent(data.orderRef)}`)
        return
      }

      // Order is created as pending_payment — now start the actual Paystack
      // checkout. Cart is intentionally NOT cleared yet: if the buyer
      // abandons payment, they should still have their items.
      const payRes = await fetch('/api/payment/paystack-initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef: data.orderRef }),
      })
      const payData = await payRes.json()
      if (!payRes.ok || !payData.authorizationUrl) {
        setError(payData.error || 'Could not start payment. Please try again.')
        return
      }

      window.location.href = payData.authorizationUrl
    } catch {
      setError('Could not place order. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Map picker overlay */}
      {showMap && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
            <Loader2 size={28} className="animate-spin text-pepper" />
          </div>
        }>
          <LocationMapPicker
            initialLocation={deliveryCoords ? { ...deliveryCoords, label: form.address } : undefined}
            onConfirm={(coords, label) => {
              setShowMap(false)
              if (!isWithinServiceArea(coords.lat, coords.lng)) {
                setDeliveryCoords(null)
                setLocationSource(null)
                setErrors(e => ({
                  ...e,
                  address: `Delivery isn't available there yet — we currently deliver within ${SERVICE_AREA_LABEL}, and we'll be expanding soon.`,
                }))
                return
              }
              setDeliveryCoords(coords)
              setLocationSource('pin')
              setForm(f => ({ ...f, address: f.address.trim() ? f.address : label }))
              setErrors(e => ({ ...e, address: undefined }))
            }}
            onClose={() => setShowMap(false)}
          />
        </Suspense>
      )}

      <div className="min-h-screen bg-[#eef1f4] flex flex-col">
        <header className="bg-white/90 backdrop-blur-md border-b border-soil/8 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <button onClick={() => router.back()} className="p-1.5 -ml-1 text-soil/60 hover:text-soil transition-colors">
              <ChevronLeft size={22} />
            </button>
            <span className="font-body text-soil text-[17px] font-semibold">Checkout</span>
            <div className="flex-1" />
            <Logo height={24} />
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide">
            <span className="text-pepper font-semibold">1 · Details</span>
            <span className="text-soil/20">—</span>
            <span className="text-soil/35">2 · Place order</span>
            <span className="text-soil/20">—</span>
            <span className="text-soil/35">3 · Confirmed</span>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-10">
          <MarketDayBanner compact />
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">

            {/* ── Left: form ── */}
            <div className="w-full lg:flex-1 space-y-5">

              {/* Delivery fee — distance-based */}
              <div className="wen-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-soil/8">
                  <Truck size={16} className="text-pepper" />
                  <h2 className="font-body text-soil text-[16px] font-semibold">Delivery</h2>
                </div>
                <div className="px-5 pt-4">
                  <p className="text-[12px] font-semibold text-soil/50 uppercase tracking-wide mb-2.5">Delivery type</p>
                  <div className="grid grid-cols-2 gap-2.5 mb-1">
                    <button
                      type="button"
                      onClick={() => setWantsMarketDay(false)}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                        !wantsMarketDay
                          ? 'border-pepper bg-pepper/5'
                          : 'border-soil/10 bg-grain-dim'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Truck size={15} className={!wantsMarketDay ? 'text-pepper-deep' : 'text-stone/40'} />
                        {!wantsMarketDay && <Check size={14} className="text-pepper-deep" />}
                      </div>
                      <p className="text-[13px] font-semibold text-soil">Standard</p>
                      <p className="text-[11px] text-stone/50 mt-0.5">We deliver as soon as possible</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWantsMarketDay(true)}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                        wantsMarketDay
                          ? 'border-pepper bg-pepper/5'
                          : 'border-soil/10 bg-grain-dim'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <CalendarDays size={15} className={wantsMarketDay ? 'text-pepper-deep' : 'text-stone/40'} />
                        {wantsMarketDay && <Check size={14} className="text-pepper-deep" />}
                      </div>
                      <p className="text-[13px] font-semibold text-soil">Market Day</p>
                      <p className="text-[11px] text-stone/50 mt-0.5">20% off delivery + 5% cashback</p>
                    </button>
                  </div>
                  <p className="text-[11px] text-stone/40 mb-2">
                    {wantsMarketDay
                      ? `Delivered on ${marketDay?.nextMarketDayWeekday ?? 'the next Market Day'} — the discount and cashback below apply.`
                      : 'Market Day delivery can be picked any day — it’s scheduled for the next Wednesday or Saturday run.'}
                  </p>
                </div>
                <div className="px-5 pb-4">
                  {!deliveryCoords ? (
                    <div className="flex items-center gap-3 text-[13px] text-stone/50">
                      <MapPin size={14} className="shrink-0" />
                      <span>Choose an address suggestion below, or add an optional map pin, to estimate delivery.</span>
                    </div>
                  ) : !deliveryCalc ? (
                    <div className="flex items-center gap-2 text-[13px] text-stone/50">
                      <Loader2 size={14} className="animate-spin shrink-0" />
                      <span>Calculating…</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[14px] font-semibold text-soil">
                            ₦200 per km · {deliveryCalc.distanceKm} km
                          </p>
                          <p className="text-[12px] text-stone/50 mt-0.5">
                            {locationSource === 'address'
                              ? 'Estimated from the selected address'
                              : 'From our Welfare Quarters dispatch point'}
                          </p>
                        </div>
                        <div className="text-right">
                          {deliveryCalc.discount > 0 && (
                            <p className="text-[12px] text-stone/40 line-through">
                              ₦{deliveryCalc.baseFee.toLocaleString('en-NG')}
                            </p>
                          )}
                          <p className="text-[16px] font-bold text-pepper-deep">
                            ₦{deliveryCalc.finalFee.toLocaleString('en-NG')}
                          </p>
                        </div>
                      </div>
                      {deliveryCalc.discount > 0 && (
                        <div className="flex items-center gap-1.5 bg-pepper/6 rounded-lg px-3 py-1.5">
                          <span className="text-[11px] font-bold text-pepper-deep">
                            Market Day — 20% off delivery · saving ₦{deliveryCalc.discount.toLocaleString('en-NG')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery details card */}
              <div className="wen-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-soil/8">
                  <MapPin size={16} className="text-pepper" />
                  <h2 className="font-body text-soil text-[16px] font-semibold">Your details</h2>
                </div>
                <div className="px-5 py-5 space-y-4">

                  {/* Full name */}
                  <div>
                    <label htmlFor="checkout-name" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                      <User size={13} />
                      Full name
                    </label>
                    <input
                      id="checkout-name"
                      name="name"
                      autoComplete="name"
                      value={form.fullName}
                      onChange={e => setForm({ ...form, fullName: e.target.value })}
                      placeholder="Your full name"
                      className={`wen-input bg-white ${errors.fullName ? '!border-red-400' : ''}`}
                    />
                    {errors.fullName && <p className="text-[12px] text-red-500 mt-1">{errors.fullName}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="checkout-phone" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                      <Phone size={13} />
                      Phone number
                    </label>
                    <input
                      id="checkout-phone"
                      name="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      placeholder="08012345678"
                      type="tel"
                      className={`wen-input bg-white ${errors.phone ? '!border-red-400' : ''}`}
                    />
                    {errors.phone && <p className="text-[12px] text-red-500 mt-1">{errors.phone}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="checkout-email" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                      <Mail size={13} />
                      Email
                    </label>
                    <input
                      id="checkout-email"
                      name="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      className={`wen-input bg-white ${errors.email ? '!border-red-400' : ''}`}
                    />
                    {errors.email
                      ? <p className="text-[12px] text-red-500 mt-1">{errors.email}</p>
                      : <p className="text-[12px] text-soil/40 mt-1">Your payment receipt goes here</p>}
                  </div>

                  {/* Location picker */}
                  <div>
                    <label htmlFor="checkout-address" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                      <MapPin size={13} />
                      Recipient&apos;s delivery address
                    </label>
                    <AddressAutocomplete
                      id="checkout-address"
                      value={form.address}
                      invalid={!!errors.address}
                      onChange={handleAddressChange}
                      onSelect={handleAddressSelect}
                    />
                    {errors.address && <p className="text-[12px] text-red-500 mt-1">{errors.address}</p>}

                    {locationSource === 'address' && (
                      <p className="mt-2 text-[11.5px] font-medium text-green-700">
                        Address selected. The optional pin can refine the delivery estimate to the exact gate or door.
                      </p>
                    )}
                    {locationSource === 'pin' && (
                      <p className="mt-2 text-[11.5px] font-medium text-green-700">
                        Exact map pin saved ({deliveryCoords?.lat.toFixed(5)}, {deliveryCoords?.lng.toFixed(5)}).
                      </p>
                    )}

                    <div className="mt-3">
                      <label htmlFor="checkout-address-details" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                        House number, street, or apartment <span className="font-normal text-stone/40">(optional)</span>
                      </label>
                      <input
                        id="checkout-address-details"
                        autoComplete="address-line2"
                        maxLength={180}
                        value={form.addressDetails}
                        onChange={e => setForm({ ...form, addressDetails: e.target.value })}
                        placeholder="e.g. 12B, flat 3, second floor"
                        className="wen-input bg-white"
                      />
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setShowMap(true)}
                        className="w-full flex items-center justify-center gap-2 border border-soil/15 rounded-xl py-3 text-[13px] font-semibold text-soil/70 hover:border-pepper/40 hover:bg-pepper/3 transition-colors"
                      >
                        <Navigation size={15} className="text-pepper" />
                        {locationSource === 'pin' ? 'Adjust exact map pin' : 'Add an exact map pin (optional)'}
                      </button>
                    </div>

                    {form.address && (
                      <div className="mt-3">
                        <label htmlFor="checkout-landmark" className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                          <MapPin size={13} />
                          Landmark / directions <span className="font-normal text-stone/40">(optional)</span>
                        </label>
                        <input
                          id="checkout-landmark"
                          maxLength={180}
                          value={form.landmark}
                          onChange={e => setForm({ ...form, landmark: e.target.value })}
                          placeholder="e.g. beside First Bank, blue gate"
                          className="wen-input bg-white"
                        />
                        <p className="text-[11.5px] text-stone/50 mt-1">
                          Add a nearby shop, gate colour, or directions that will help the rider.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Buyer type */}
                  <div>
                    <label className="text-[13px] font-medium text-soil/70 block mb-2">I&apos;m ordering as a</label>
                    <div className="grid grid-cols-3 gap-2">
                      {BUYER_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setForm({ ...form, buyerType: t.value })}
                          className={`text-[13px] font-medium py-2.5 rounded-xl border transition-all ${
                            form.buyerType === t.value
                              ? 'bg-soil text-white border-soil'
                              : 'bg-grain-dim text-stone border-soil/10 hover:border-soil/25'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[13px] font-medium text-soil/70 mb-1.5">
                      <FileText size={13} />
                      Notes <span className="text-stone/40 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="Any special instructions…"
                      rows={3}
                      className="wen-input bg-white resize-none min-h-[5.5rem]"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <p className="text-[13px] text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* ── Right: order summary ── */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="wen-surface overflow-hidden sticky top-24">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-soil/8">
                  <ShoppingBag size={16} className="text-pepper" />
                  <h2 className="font-body text-soil text-[16px] font-semibold">Order summary</h2>
                  <span className="ml-auto font-data text-[12px] text-stone/40">{cartCount} items</span>
                </div>

                <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
                  {cartLines.map(line => {
                    const img = line.imageUrl || CATEGORY_IMAGES[line.category] || CATEGORY_IMAGES.other
                    return (
                      <div key={line.id} className="flex items-center gap-3 py-1.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-soil/8">
                          <img src={img} alt={line.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-soil text-[13px] font-medium truncate">{line.name}</p>
                          <p className="text-stone/45 text-[11px] font-data">×{line.quantity}</p>
                        </div>
                        <p className="text-soil text-[13px] font-semibold shrink-0">
                          {line.price ? fmt(line.price * line.quantity) : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>

                <div className="px-5 py-4 border-t border-soil/8 space-y-2">
                  {hasPrices && (
                    <div className="flex justify-between text-[13px] text-stone/60">
                      <span>Subtotal</span>
                      <span>{fmt(cartTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13px] text-stone/60">
                    <span className="flex items-center gap-1.5">
                      <Truck size={12} className="text-soil/40" />
                      Delivery{deliveryCalc ? ` · ${deliveryCalc.distanceKm} km` : ''}
                    </span>
                    <span>
                      {deliveryFee != null
                        ? fmt(deliveryFee)
                        : <span className="text-stone/35 italic text-[11px]">set location</span>}
                    </span>
                  </div>
                  {(deliveryCalc?.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-[13px] text-pepper-deep">
                      <span>Market Day delivery (20% off)</span>
                      <span className="font-semibold">− {fmt(deliveryCalc!.discount)}</span>
                    </div>
                  )}
                  {deliveryCreditApplied > 0 && (
                    <div className="flex justify-between text-[13px] text-pepper-deep">
                      <span>Delivery credit applied</span>
                      <span className="font-semibold">− {fmt(deliveryCreditApplied)}</span>
                    </div>
                  )}

                  {walletBalance > 0 && (
                    <div className="pt-1 pb-0.5">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-[13px] text-soil/70">
                          Pay with wallet <span className="text-stone/40">({fmt(walletBalance)} available)</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={useWallet}
                          onChange={e => {
                            setUseWallet(e.target.checked)
                            if (!e.target.checked) setWalletAmountInput('')
                          }}
                          className="w-4 h-4 accent-pepper shrink-0"
                        />
                      </label>
                      {useWallet && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-stone/50 text-[13px]">₦</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={walletMaxApplicable}
                            step={1}
                            value={walletAmountInput}
                            onChange={e => setWalletAmountInput(e.target.value)}
                            placeholder={walletMaxApplicable.toLocaleString('en-NG')}
                            className="flex-1 bg-[#eef1f4] border border-soil/12 rounded-lg px-2.5 py-1.5 text-[13px] text-soil outline-none focus:border-pepper"
                          />
                          <button
                            type="button"
                            onClick={() => setWalletAmountInput(String(walletMaxApplicable))}
                            className="text-[11.5px] font-semibold text-pepper-deep shrink-0"
                          >
                            Max
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {walletAmountApplied > 0 && (
                    <div className="flex justify-between text-[13px] text-pepper-deep">
                      <span>Wallet applied</span>
                      <span className="font-semibold">− {fmt(walletAmountApplied)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-body text-soil text-[16px] font-bold pt-2 border-t border-soil/8">
                    <span>Total</span>
                    <span>{grandTotal != null ? fmt(grandTotal) : '—'}</span>
                  </div>
                  <p className="text-[11px] text-stone/40">
                    {deliveryFee == null
                      ? 'Choose an address suggestion or add a map pin to estimate your total'
                      : locationSource === 'address'
                        ? 'Delivery estimated from the selected address; final fee confirmed before delivery'
                        : 'Final price confirmed before delivery'}
                  </p>
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? 'Placing order…' : 'Place order'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </>
  )
}
