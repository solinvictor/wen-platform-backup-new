'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Package, CheckCircle2, Truck, Home as HomeIcon,
  XCircle, MapPin, Clock, Loader2, MessageCircle, CreditCard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TrackedOrder {
  id: string
  order_ref: string | null
  product_summary: string
  delivery_type: 'standard' | 'express' | null
  delivery_fee: number | null
  market_day?: 'Wednesday' | 'Saturday' | null
  discount_amount?: number | null
  expected_delivery_date?: string | null
  status: 'pending_payment' | 'pending' | 'matched' | 'in_progress' | 'delivered' | 'cancelled'
  notes: string | null
  created_at: string
  delivery_address: string
  w3w_address?: string | null
}

const STEPS = [
  { key: 'pending_payment', label: 'Awaiting payment',  Icon: CreditCard },
  { key: 'pending',         label: 'Order placed',      Icon: Package },
  { key: 'matched',         label: 'Confirmed',          Icon: CheckCircle2 },
  { key: 'in_progress',     label: 'Out for delivery',   Icon: Truck },
  { key: 'delivered',       label: 'Delivered',          Icon: HomeIcon },
] as const

function stepIndex(status: TrackedOrder['status']) {
  const i = STEPS.findIndex((s) => s.key === status)
  return i === -1 ? 0 : i
}

function fmtFee(n: number | null) {
  if (!n) return null
  return '₦' + n.toLocaleString('en-NG')
}

function expectedBy(
  createdAt: string,
  deliveryType: TrackedOrder['delivery_type'],
  expectedDeliveryDate?: string | null,
) {
  if (expectedDeliveryDate) {
    return new Date(`${expectedDeliveryDate}T12:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }
  const days = deliveryType === 'express' ? 1 : 3
  const d = new Date(createdAt)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

export default function TrackOrderPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data, error: err } = await supabase
          .from('my_orders')
          .select('*')
          .eq('id', params.orderId)
          .single()
        if (cancelled) return
        if (err || !data) setError('Order not found.')
        else setOrder(data as TrackedOrder)
      } catch {
        if (!cancelled) setError('Could not load this order.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [params.orderId])

  return (
    <div className="min-h-screen bg-[#eef1f4]">
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 sticky top-0 z-30 bg-white border-b border-soil/8">
        <button onClick={() => router.back()} aria-label="Back" className="p-2 -ml-2 text-soil">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-body text-soil text-[18px] font-bold">Track Order</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-stone/40" />
          </div>
        ) : error || !order ? (
          <div className="bg-white border border-soil/10 rounded-2xl px-5 py-14 text-center">
            <p className="text-soil font-semibold mb-1">{error || 'Order not found.'}</p>
            <Link href="/account" className="text-pepper text-[14px] font-semibold">Back to my orders</Link>
          </div>
        ) : order.status === 'cancelled' ? (
          <div className="bg-white border border-red-100 rounded-2xl px-6 py-10 text-center">
            <XCircle size={32} className="text-red-400 mx-auto mb-3" />
            <p className="font-body text-soil text-[16px] font-semibold mb-1">This order was cancelled</p>
            <p className="text-stone/55 text-[13.5px]">{order.order_ref ?? 'WEN-XXXXXX'}</p>
          </div>
        ) : (
          <>
            {/* Status stepper */}
            <div className="bg-white border border-soil/10 rounded-2xl px-6 py-8 mb-4">
              <p className="font-data text-[11px] text-stone/45 uppercase tracking-wide mb-6">
                {order.order_ref ?? 'WEN-XXXXXX'}
              </p>
              <div className="relative">
                {STEPS.map((step, i) => {
                  const current = stepIndex(order.status)
                  const done = i <= current
                  const isLast = i === STEPS.length - 1
                  return (
                    <div key={step.key} className="flex gap-4">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                          done ? 'bg-pepper border-pepper text-white' : 'bg-white border-soil/15 text-stone/35'
                        }`}>
                          <step.Icon size={16} />
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 flex-1 min-h-[28px] ${i < current ? 'bg-pepper' : 'bg-soil/10'}`} />
                        )}
                      </div>
                      <div className={isLast ? 'pb-0' : 'pb-7'}>
                        <p className={`text-[14px] font-semibold ${done ? 'text-soil' : 'text-stone/40'}`}>
                          {step.label}
                        </p>
                        {step.key === order.status && (
                          <p className="text-pepper text-[12px] font-medium mt-0.5">Current status</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Delivery details */}
            <div className="bg-white border border-soil/10 rounded-2xl px-5 py-5 mb-4 space-y-4">
              <p className="text-[11px] font-semibold text-stone/45 uppercase tracking-wide">Delivery details</p>
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-stone/40 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11.5px] text-stone/45 mb-0.5">Address</p>
                  <p className="text-soil text-[13.5px]">{order.delivery_address}</p>
                  {order.w3w_address && (
                    <p className="text-stone/45 text-[12px] mt-0.5">///{order.w3w_address}</p>
                  )}
                </div>
              </div>
              {order.status !== 'delivered' && (
                <div className="flex items-start gap-3">
                  <Clock size={15} className="text-stone/40 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11.5px] text-stone/45 mb-0.5">Expected by</p>
                    <p className="text-soil text-[13.5px]">
                      {expectedBy(order.created_at, order.delivery_type, order.expected_delivery_date)}
                      {order.delivery_type && (
                        <span className="text-stone/45"> · {order.delivery_type === 'express' ? 'Express' : 'Standard'}</span>
                      )}
                      {order.market_day && (
                        <span className="block text-pepper text-[11px] font-medium mt-1">
                          Market Day order · {order.discount_amount ? `₦${Number(order.discount_amount).toLocaleString('en-NG')} saved` : 'next-day delivery'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              <div className="pt-1 border-t border-soil/8">
                <p className="text-[11.5px] text-stone/45 mb-1">Items</p>
                <p className="text-soil text-[13.5px] leading-relaxed">{order.product_summary}</p>
              </div>
              {fmtFee(order.delivery_fee) && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone/50">Delivery fee</span>
                  <span className="text-soil font-semibold">{fmtFee(order.delivery_fee)}</span>
                </div>
              )}
            </div>

            {/* Need help */}
            <Link
              href="/contact"
              className="flex items-center gap-3 bg-white border border-soil/10 rounded-2xl px-5 py-4 hover:border-pepper/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-pepper/8 flex items-center justify-center shrink-0">
                <MessageCircle size={16} className="text-pepper" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-soil text-[13.5px] font-semibold">Need help with this order?</p>
                <p className="text-stone/50 text-[12px]">Contact WEN</p>
              </div>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
