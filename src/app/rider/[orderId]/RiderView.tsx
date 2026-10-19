'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MapPin, Phone, Package, Clock, CheckCircle2,
  Navigation, Loader2, Locate, MessageCircle, Copy, Check,
} from 'lucide-react'
import Link from 'next/link'

interface Buyer {
  full_name: string
  phone_number: string
  location: string
  landmark: string | null
  delivery_lat: number | null
  delivery_lng: number | null
}

interface Order {
  id: string
  order_ref: string | null
  product_summary: string
  delivery_type: string | null
  delivery_fee: number | null
  status: string
  notes: string | null
  created_at: string
  buyers: Buyer | Buyer[] | null
}

const STATUS_FLOW = ['pending', 'matched', 'in_progress', 'delivered'] as const

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  matched: 'Ready',
  in_progress: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  matched: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const NEXT_LABEL: Record<string, string> = {
  matched: 'Mark ready',
  in_progress: 'Start delivery',
  delivered: 'Mark delivered',
}

function fmt(n: number | null) {
  if (!n) return '—'
  return '₦' + n.toLocaleString('en-NG')
}

function formatAccuracy(meters: number): { label: string; color: string } {
  if (meters <= 10) return { label: `±${Math.round(meters)}m — Excellent`, color: 'text-green-600' }
  if (meters <= 30) return { label: `±${Math.round(meters)}m — Good`, color: 'text-green-500' }
  if (meters <= 100) return { label: `±${Math.round(meters)}m — Fair`, color: 'text-amber-500' }
  return { label: `±${Math.round(meters)}m — Poor`, color: 'text-red-500' }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Open Google Maps turn-by-turn to the delivery pin */
function mapsNavigateUrl(destLat: number, destLng: number, fromLat?: number, fromLng?: number) {
  if (fromLat != null && fromLng != null) {
    return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${destLat},${destLng}&travelmode=driving`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`
}

function RiderGPS({
  destLat,
  destLng,
}: {
  destLat: number | null
  destLng: number | null
}) {
  const [pos, setPos] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState('')
  const [watching, setWatching] = useState(false)
  const watchId = useRef<number | null>(null)

  function startTracking() {
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      return
    }
    setWatching(true)
    setError('')
    watchId.current = navigator.geolocation.watchPosition(
      (p) => setPos(p),
      (e) => {
        if (e.code === 1) setError('Location access denied — allow it in browser settings')
        else if (e.code === 2) setError('Cannot detect position — check GPS signal')
        else setError('Location timed out')
        setWatching(false)
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    )
  }

  function stopTracking() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    setWatching(false)
  }

  useEffect(() => {
    startTracking()
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  const accuracy = pos ? formatAccuracy(pos.coords.accuracy) : null
  const distKm =
    pos && destLat != null && destLng != null
      ? haversineKm(pos.coords.latitude, pos.coords.longitude, destLat, destLng)
      : null
  // Rough city ETA: assume ~25 km/h average
  const etaMin = distKm != null ? Math.max(1, Math.round((distKm / 25) * 60)) : null

  const navigateUrl =
    destLat != null && destLng != null
      ? mapsNavigateUrl(
          destLat,
          destLng,
          pos?.coords.latitude,
          pos?.coords.longitude
        )
      : null

  return (
    <div className="bg-white rounded-2xl border border-soil/8 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-soil/8">
        <Locate size={16} className="text-pepper" />
        <h2 className="font-body text-soil text-[15px] font-semibold">Navigation</h2>
        {watching && (
          <span className="ml-auto text-[11px] text-green-600 font-medium">GPS on</span>
        )}
      </div>
      <div className="px-5 py-4 space-y-3">
        {error && <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">{error}</p>}
        {pos && accuracy && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span className={accuracy.color}>{accuracy.label}</span>
            {distKm != null && (
              <span className="text-soil font-semibold tabular-nums">
                {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}
                {etaMin != null ? ` · ~${etaMin} min` : ''}
              </span>
            )}
          </div>
        )}
        {!pos && !error && (
          <p className="text-[12px] text-soil/45">Getting your GPS…</p>
        )}
        {navigateUrl ? (
          <a
            href={navigateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-soil text-white text-[15px] font-semibold py-3.5 rounded-2xl hover:bg-soil/90 active:scale-[0.98] transition-all"
          >
            <Navigation size={18} />
            Open in Google Maps
          </a>
        ) : (
          <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            No GPS pin on this order — use the address and landmark, or ask admin to re-pin.
          </p>
        )}
        <p className="text-[11px] text-soil/40 text-center">
          Opens Google Maps turn-by-turn to the buyer’s exact pin
        </p>
        <button
          type="button"
          onClick={watching ? stopTracking : startTracking}
          className="w-full text-[12px] text-soil/50 py-1"
        >
          {watching ? 'Pause GPS' : 'Resume GPS'}
        </button>
      </div>
    </div>
  )
}

export default function RiderView({ order: initial }: { order: Order }) {
  const [order, setOrder] = useState(initial)
  const [updating, setUpdating] = useState(false)
  const [copied, setCopied] = useState(false)

  const buyer = Array.isArray(order.buyers) ? order.buyers[0] : order.buyers
  const isDelivered = order.status === 'delivered'
  const isCancelled = order.status === 'cancelled'
  const idx = STATUS_FLOW.indexOf(order.status as (typeof STATUS_FLOW)[number])
  const nextStatus = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null

  const phone = buyer?.phone_number?.replace(/\s+/g, '') || ''
  const telHref = phone ? `tel:${phone}` : null
  const waHref = phone
    ? `https://wa.me/${phone.replace(/^\+/, '').replace(/^0/, '234')}`
    : null

  async function markNextStatus() {
    if (!nextStatus || updating) return
    setUpdating(true)
    try {
      const supabase = createClient()
      const patch: Record<string, unknown> = { status: nextStatus }
      if (nextStatus === 'delivered') patch.delivered_at = new Date().toISOString()
      const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
      if (!error) setOrder((o) => ({ ...o, status: nextStatus }))
    } finally {
      setUpdating(false)
    }
  }

  async function copyPin() {
    if (buyer?.delivery_lat == null || buyer?.delivery_lng == null) return
    const text = `${buyer.delivery_lat},${buyer.delivery_lng}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-grain-dim flex flex-col pb-28">
      <header className="bg-white border-b border-soil/8 sticky top-0 z-40 px-4 h-14 flex items-center gap-3">
        <Link href="/rider" className="text-[13px] font-medium text-soil/50 hover:text-soil">
          ← Orders
        </Link>
        <span className="font-data text-[12px] text-soil/40 truncate">
          {order.order_ref || order.id.slice(0, 8)}
        </span>
        <span
          className={`ml-auto shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status] || ''}`}
        >
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </header>

      <main className="max-w-lg mx-auto w-full px-4 py-5 space-y-4">
        {/* Landmark first */}
        <div className="bg-white rounded-2xl border border-soil/8 p-5 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-soil/40 uppercase tracking-wide mb-1">
              Deliver to
            </p>
            <p className="font-body text-soil text-lg font-bold leading-snug">
              {buyer?.full_name || 'Buyer'}
            </p>
          </div>

          {buyer?.landmark && (
            <div className="bg-pepper/8 border border-pepper/15 rounded-xl px-3.5 py-3">
              <p className="text-[10px] font-bold text-pepper uppercase tracking-wide mb-0.5">
                Landmark / gate
              </p>
              <p className="text-[15px] font-semibold text-soil leading-snug">{buyer.landmark}</p>
            </div>
          )}

          {buyer?.location && (
            <div className="flex items-start gap-2 text-[13px] text-soil/70">
              <MapPin size={14} className="text-pepper shrink-0 mt-0.5" />
              <span>{buyer.location}</span>
            </div>
          )}

          {buyer?.delivery_lat != null && buyer?.delivery_lng != null && (
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-soil/40 tabular-nums">
                {buyer.delivery_lat.toFixed(5)}, {buyer.delivery_lng.toFixed(5)}
              </p>
              <button
                type="button"
                onClick={copyPin}
                className="flex items-center gap-1 text-[11px] font-medium text-pepper"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy pin'}
              </button>
            </div>
          )}

          {/* Call / WhatsApp */}
          <div className="flex gap-2 pt-1">
            {telHref ? (
              <a
                href={telHref}
                className="flex-1 flex items-center justify-center gap-2 bg-pepper text-white text-[14px] font-semibold py-3.5 rounded-2xl active:scale-[0.98]"
              >
                <Phone size={16} />
                Call
              </a>
            ) : (
              <div className="flex-1 text-center text-[12px] text-soil/40 py-3">No phone</div>
            )}
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white text-[14px] font-semibold py-3.5 rounded-2xl active:scale-[0.98]"
              >
                <MessageCircle size={16} />
                WhatsApp
              </a>
            )}
          </div>
        </div>

        <RiderGPS destLat={buyer?.delivery_lat ?? null} destLng={buyer?.delivery_lng ?? null} />

        <div className="bg-white rounded-2xl border border-soil/8 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-soil/8">
            <Package size={16} className="text-pepper" />
            <h2 className="font-body text-soil text-[15px] font-semibold">Items</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[14px] text-soil leading-relaxed whitespace-pre-wrap">
              {order.product_summary}
            </p>
            {order.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-amber-600 font-semibold mb-0.5">Buyer note</p>
                <p className="text-[13px] text-amber-800">{order.notes}</p>
              </div>
            )}
            {order.delivery_type && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-stone/50 flex items-center gap-1.5">
                  <Clock size={12} />
                  {order.delivery_type === 'express' ? 'Express (24hrs)' : 'Standard (ASAP)'}
                </span>
                <span className="font-semibold text-soil">{fmt(order.delivery_fee)}</span>
              </div>
            )}
          </div>
        </div>

        {isDelivered && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
            <CheckCircle2 size={22} className="text-green-500 shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-green-800">Delivered</p>
              <p className="text-[12px] text-green-600">Order complete.</p>
            </div>
          </div>
        )}
      </main>

      {/* Sticky status action */}
      {!isDelivered && !isCancelled && nextStatus && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-soil/10 bg-white/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={markNextStatus}
              disabled={updating}
              className="w-full flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {updating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {updating ? 'Updating…' : NEXT_LABEL[nextStatus]}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
