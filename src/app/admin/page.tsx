'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AdminShell } from '@/components/AdminShell'
import {
  ShoppingBag, Sprout, Wallet, Clock, RefreshCw,
  ArrowUpRight, UserPlus, Package, CalendarDays,
} from 'lucide-react'

type OrderStatus =
  | 'pending_payment' | 'payment_failed' | 'paid'
  | 'pending' | 'matched' | 'in_progress' | 'delivered' | 'cancelled'

interface OrderRow {
  id: string
  order_ref: string | null
  product_summary: string
  status: OrderStatus
  amount_total: number | null
  created_at: string
  market_day: string | null
  buyer: { full_name: string } | null
}

interface ProfileRow {
  id: string
  email: string | null
  role: string | null
  created_at: string
}

interface FarmerRow {
  id: string
  full_name: string
  produce_type: string
  location: string | null
  status: string
  created_at: string
}

interface ActivityItem {
  id: string
  kind: 'order' | 'signup' | 'farmer'
  title: string
  subtitle: string
  createdAt: string
  href: string
  tone: 'pepper' | 'leaf' | 'turmeric'
}

const LAGOS_TZ = 'Africa/Lagos'
const REFRESH_MS = 20_000

/** Same rule the orders admin page uses — any delivery-lifecycle status
 * implies payment already cleared (orders created before this payment
 * flow existed had no 'paid' intermediate state). */
function isPaid(status: OrderStatus) {
  return status !== 'pending_payment' && status !== 'payment_failed'
}

function todayKey(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function dateKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

function fmtNaira(n: number) {
  return '₦' + Math.round(n).toLocaleString('en-NG')
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [farmers, setFarmers] = useState<FarmerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [, setTick] = useState(0) // bumping this re-renders "x ago" labels without refetching
  const mounted = useRef(true)

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const supabase = createClient()
    const [{ data: ordersData, error: ordersErr }, { data: profilesData, error: profilesErr }, { data: farmersData, error: farmersErr }] =
      await Promise.all([
        supabase
          .from('orders')
          .select('id, order_ref, product_summary, status, amount_total, created_at, market_day, buyer:buyers(full_name)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('profiles')
          .select('id, email, role, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('farmers')
          .select('id, full_name, produce_type, location, status, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

    if (ordersErr) console.error('[admin/dashboard] orders load failed:', ordersErr.message)
    if (profilesErr) console.error('[admin/dashboard] profiles load failed:', profilesErr.message)
    if (farmersErr) console.error('[admin/dashboard] farmers load failed:', farmersErr.message)

    if (!mounted.current) return
    setOrders((ordersData as any) || [])
    setProfiles(profilesData || [])
    setFarmers(farmersData || [])
    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    load(false)
    const dataInterval = window.setInterval(() => load(true), REFRESH_MS)
    const tickInterval = window.setInterval(() => setTick(t => t + 1), 15_000)
    return () => {
      mounted.current = false
      window.clearInterval(dataInterval)
      window.clearInterval(tickInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <AdminShell>
        <p className="text-soil/50 text-[14px]">Loading dashboard…</p>
      </AdminShell>
    )
  }

  const today = todayKey(LAGOS_TZ)
  const paidOrders = orders.filter(o => isPaid(o.status))
  const todaysPaidOrders = paidOrders.filter(o => dateKey(o.created_at, LAGOS_TZ) === today)
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.amount_total ?? 0), 0)
  const todaysRevenue = todaysPaidOrders.reduce((sum, o) => sum + Number(o.amount_total ?? 0), 0)
  const pendingDispatch = orders.filter(o => o.status === 'paid').length
  const marketDayOrdersToday = todaysPaidOrders.filter(o => !!o.market_day).length

  const signups = profiles.filter(p => p.role !== 'admin')
  const signupsToday = signups.filter(p => dateKey(p.created_at, LAGOS_TZ) === today).length

  const pendingFarmers = farmers.filter(f => f.status === 'pending').length
  const farmersToday = farmers.filter(f => dateKey(f.created_at, LAGOS_TZ) === today).length

  const cards: { label: string; value: string; sub: string; icon: typeof ShoppingBag; tone: string }[] = [
    {
      label: 'Revenue today',
      value: fmtNaira(todaysRevenue),
      sub: `${todaysPaidOrders.length} order${todaysPaidOrders.length !== 1 ? 's' : ''} today`,
      icon: Wallet,
      tone: 'text-pepper',
    },
    {
      label: 'All-time revenue',
      value: fmtNaira(totalRevenue),
      sub: `${paidOrders.length} paid order${paidOrders.length !== 1 ? 's' : ''}`,
      icon: ArrowUpRight,
      tone: 'text-okra',
    },
    {
      label: 'Awaiting dispatch',
      value: String(pendingDispatch),
      sub: 'paid, not yet assigned',
      icon: Package,
      tone: 'text-turmeric',
    },
    {
      label: 'New signups',
      value: String(signupsToday),
      sub: `${signups.length} all-time`,
      icon: UserPlus,
      tone: 'text-pepper',
    },
    {
      label: 'Market Day orders',
      value: String(marketDayOrdersToday),
      sub: 'today',
      icon: CalendarDays,
      tone: 'text-okra',
    },
    {
      label: 'Farmer applications',
      value: String(pendingFarmers),
      sub: `${farmersToday} new today`,
      icon: Sprout,
      tone: 'text-turmeric',
    },
  ]

  const activity: ActivityItem[] = [
    ...orders.slice(0, 25).map((o): ActivityItem => ({
      id: `order-${o.id}`,
      kind: 'order',
      title: o.buyer?.full_name ? `${o.buyer.full_name} placed an order` : 'New order',
      subtitle: `${o.order_ref ?? o.id.slice(0, 8)} · ${o.amount_total != null ? fmtNaira(Number(o.amount_total)) : '—'} · ${o.status.replace('_', ' ')}`,
      createdAt: o.created_at,
      href: '/admin/orders',
      tone: isPaid(o.status) ? 'pepper' : 'turmeric',
    })),
    ...signups.slice(0, 25).map((p): ActivityItem => ({
      id: `signup-${p.id}`,
      kind: 'signup',
      title: 'New account signed up',
      subtitle: p.email ?? 'no email on file',
      createdAt: p.created_at,
      href: '/admin/buyers',
      tone: 'leaf',
    })),
    ...farmers.slice(0, 25).map((f): ActivityItem => ({
      id: `farmer-${f.id}`,
      kind: 'farmer',
      title: `${f.full_name} applied as a farmer`,
      subtitle: `${f.produce_type}${f.location ? ` · ${f.location}` : ''} · ${f.status}`,
      createdAt: f.created_at,
      href: '/admin/farmers',
      tone: f.status === 'pending' ? 'turmeric' : 'leaf',
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)

  const ICONS: Record<ActivityItem['kind'], typeof ShoppingBag> = {
    order: ShoppingBag,
    signup: UserPlus,
    farmer: Sprout,
  }
  const TONE_BG: Record<ActivityItem['tone'], string> = {
    pepper: 'bg-pepper/10 text-pepper-deep',
    leaf: 'bg-leaf/15 text-leaf-deep',
    turmeric: 'bg-turmeric/25 text-soil/70',
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <h1 className="font-body text-soil text-xl sm:text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2 text-[11.5px] text-soil/40">
          <span className="relative flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pepper opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-pepper" />
            </span>
            Live
          </span>
          <span className="hidden sm:inline">
            · updated {lastUpdated ? timeAgo(lastUpdated.toISOString()) : '—'}
          </span>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-soil/5 text-soil/50 hover:text-soil transition-colors disabled:opacity-50"
            aria-label="Refresh now"
            title="Refresh now"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 mb-6 sm:mb-8">
        {cards.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="bg-grain rounded-xl p-5 border border-soil/8">
            <Icon size={16} className={`${tone} mb-3`} />
            <p className="font-body text-soil text-xl sm:text-2xl font-bold mb-0.5 truncate">{value}</p>
            <p className="text-soil/50 text-[12px]">{label}</p>
            <p className="text-soil/35 text-[11px] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Live activity feed */}
      <div className="bg-grain rounded-xl border border-soil/8 overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-soil/8">
          <h2 className="text-soil font-medium text-[15px]">Recent activity</h2>
          <span className="flex items-center gap-1.5 text-[11px] text-soil/40">
            <Clock size={12} />
            refreshes every 20s
          </span>
        </div>

        {activity.length === 0 ? (
          <p className="text-soil/50 text-[13.5px] px-5 sm:px-6 py-8 text-center">Nothing yet — new orders and signups will show up here.</p>
        ) : (
          <ul className="divide-y divide-soil/6">
            {activity.map(item => {
              const Icon = ICONS[item.kind]
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3.5 px-5 sm:px-6 py-3.5 hover:bg-soil/[0.03] transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${TONE_BG[item.tone]}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-soil text-[13.5px] font-medium truncate">{item.title}</p>
                      <p className="text-soil/45 text-[12px] truncate">{item.subtitle}</p>
                    </div>
                    <span className="font-data text-soil/35 text-[11px] shrink-0 whitespace-nowrap">
                      {timeAgo(item.createdAt)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  )
}
