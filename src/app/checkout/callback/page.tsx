'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { CheckCircle2, XCircle, Loader2, ShoppingBag, Phone, Truck, MapPin } from 'lucide-react'
import { Logo } from '@/components/Logo'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return '₦' + n.toLocaleString('en-NG')
}

type VerifyState = 'checking' | 'paid' | 'failed'

function CallbackContent() {
  const searchParams = useSearchParams()
  const { clearCart } = useCart()
  const [state, setState] = useState<VerifyState>('checking')
  const [error, setError] = useState('')
  const [order, setOrder] = useState<{
    order_ref: string
    amount_total: number | null
    product_summary: string
    delivery_type: string | null
    delivery_fee: number | null
  } | null>(null)

  useEffect(() => {
    // Paystack appends reference (and sometimes trxref) to the redirect
    // URL; keep the Monnify paymentReference/transactionReference fallback
    // in case an old link from that era is still in flight.
    const reference =
      searchParams.get('reference') ||
      searchParams.get('trxref') ||
      searchParams.get('paymentReference') ||
      searchParams.get('transactionReference')
    if (!reference) {
      setState('failed')
      setError('Missing payment reference.')
      return
    }

    let cancelled = false
    fetch('/api/payment/paystack-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.paid) {
          setOrder(data.order)
          setState('paid')
          clearCart() // only now — payment is actually confirmed
        } else {
          setState('failed')
          setError(data.error || 'Payment could not be confirmed.')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('failed')
          setError('Could not reach the server to confirm your payment.')
        }
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-[#eef1f4] flex items-center justify-center px-5">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-pepper mx-auto mb-3" />
          <p className="text-soil/60 text-[14px]">Confirming your payment…</p>
        </div>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div className="min-h-screen bg-[#eef1f4] flex flex-col">
        <header className="bg-white border-b border-soil/8 px-5 h-14 flex items-center">
          <Logo height={24} />
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4 ring-4 ring-red-500/5">
              <XCircle size={32} className="text-red-500" strokeWidth={1.8} />
            </div>
            <h1 className="font-body text-soil text-2xl font-bold mb-1.5">Payment not confirmed</h1>
            <p className="text-stone/60 text-[14px] leading-relaxed mb-6">
              {error || 'Something went wrong confirming your payment. If money left your account, it will be reversed automatically — no order was placed.'}
            </p>
            <Link
              href="/checkout"
              className="w-full inline-flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors"
            >
              Try again
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // ── Paid ──────────────────────────────────────────────────────────────
  const deliveryText = order?.delivery_type === 'express'
    ? 'Dispatched within hours — arrives within 24 hours.'
    : 'Harvested fresh — we deliver as soon as possible.'

  return (
    <div className="min-h-screen bg-[#eef1f4] flex flex-col">
      <header className="bg-white border-b border-soil/8 px-5 h-14 flex items-center justify-between">
        <Logo height={24} />
        <span className="text-[11px] font-mono uppercase tracking-wider text-pepper">Paid</span>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 sm:px-5 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-pepper/10 flex items-center justify-center mx-auto mb-4 ring-4 ring-pepper/5">
              <CheckCircle2 size={32} className="text-pepper" strokeWidth={1.8} />
            </div>
            <h1 className="font-body text-soil text-2xl font-bold mb-1.5">Payment successful</h1>
            <p className="text-stone/60 text-[14px] leading-relaxed">
              Your order is confirmed and paid for.
            </p>
            <div className="inline-flex items-center gap-2 bg-white border border-soil/10 rounded-full px-4 py-2 mt-4">
              <span className="text-stone/50 text-[12px]">Ref</span>
              <span className="font-data text-soil text-[13px] font-bold tracking-wider">{order?.order_ref}</span>
            </div>
          </div>

          <div className="wen-surface p-4 text-left mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-[12px] font-semibold text-soil/50 uppercase tracking-wide">Order</p>
            </div>
            <p className="text-[13px] text-soil leading-relaxed mb-3">{order?.product_summary}</p>
            <div className="pt-3 border-t border-soil/8 flex justify-between text-[15px] font-bold text-soil">
              <span>Amount paid</span>
              <span className="font-data">{fmt(order?.amount_total)}</span>
            </div>
          </div>

          <div className="wen-surface p-4 text-left mb-4 space-y-3.5">
            <p className="text-[12px] font-semibold text-soil/50 uppercase tracking-wide">What happens next</p>
            {[
              { icon: Phone, text: 'We call within 2 hours to arrange delivery' },
              { icon: Truck, text: deliveryText },
              { icon: MapPin, text: 'A receipt has been sent to your email' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-pepper/8 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-pepper-deep" />
                </div>
                <p className="text-stone/70 text-[13px] leading-relaxed pt-1.5">{text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/store"
              className="w-full inline-flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors"
            >
              <ShoppingBag size={17} />
              Continue shopping
            </Link>
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center text-[13px] font-medium text-soil/50 hover:text-soil py-2"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#eef1f4] flex items-center justify-center px-5">
          <Loader2 size={28} className="animate-spin text-pepper" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  )
}
