'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Package, User, LogOut, Loader2,
  CheckCircle2, Clock, Truck, XCircle, RefreshCw,
  ChevronRight, Phone, Mail, MapPin, Copy, Check,
  Wallet, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BottomTabBar } from '@/components/BottomTabBar'

// ── Types ────────────────────────────────────────────────────────────────────
interface Order {
  id: string
  order_ref: string | null
  product_summary: string
  delivery_type: 'standard' | 'express' | null
  delivery_fee: number | null
  status: 'pending' | 'matched' | 'in_progress' | 'delivered' | 'cancelled'
  notes: string | null
  created_at: string
  full_name: string
  phone_number: string
  delivery_address: string
}

interface Props {
  userId: string
  initialName: string
  initialEmail: string
  initialPhone: string
  referralCode?: string | null
  buyerId?: string | null
}

interface WalletTransaction {
  id: string
  type: 'credit' | 'debit'
  amount: number
  reason: string
  balance_after: number
  created_at: string
}

function fmtNaira(n: number) {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS_META: Record<Order['status'], { label: string; Icon: React.ElementType; classes: string }> = {
  pending:     { label: 'Pending',     Icon: Clock,        classes: 'bg-amber-50   text-amber-700   border-amber-200'  },
  matched:     { label: 'Matched',     Icon: RefreshCw,    classes: 'bg-blue-50    text-blue-700    border-blue-200'   },
  in_progress: { label: 'In progress', Icon: Truck,        classes: 'bg-turmeric/20 text-pepper-deep border-turmeric'  },
  delivered:   { label: 'Delivered',   Icon: CheckCircle2, classes: 'bg-pepper/10  text-pepper-deep border-pepper/30'  },
  cancelled:   { label: 'Cancelled',   Icon: XCircle,      classes: 'bg-red-50     text-red-600     border-red-200'    },
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const { label, Icon, classes } = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-semibold ${classes}`}>
      <Icon size={11} strokeWidth={2.5} />
      {label}
    </span>
  )
}

function DeliveryBadge({ type }: { type: Order['delivery_type'] }) {
  if (!type) return null
  return type === 'express'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soil/8 text-soil/70 text-[11px] font-semibold border border-soil/12">Express · 24h</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#eef1f4] text-stone text-[11px] font-semibold border border-soil/10">Standard · 3 days</span>
}

// ── Order card ───────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const date = new Date(order.created_at).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="bg-white border border-soil/10 rounded-2xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#eef1f4]/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#eef1f4] flex items-center justify-center shrink-0">
            <Package size={16} className="text-pepper" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="font-data text-soil text-[13px] font-bold tracking-wider">
              {order.order_ref ?? 'WEN-XXXXXX'}
            </p>
            <p className="text-stone/55 text-[12px] mt-0.5">{date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-3">
          <StatusBadge status={order.status} />
          <ChevronRight
            size={15}
            className={`text-soil/30 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-soil/8 px-5 py-4 space-y-3 bg-[#eef1f4]/30">
          {/* Items */}
          <div>
            <p className="text-[11px] font-semibold text-stone/50 uppercase tracking-wider mb-1.5">Items</p>
            <p className="text-[13.5px] text-soil leading-relaxed">{order.product_summary}</p>
          </div>
          {/* Delivery */}
          <div className="flex items-center gap-3 flex-wrap">
            <DeliveryBadge type={order.delivery_type} />
            {order.delivery_fee != null && (
              <span className="font-data text-[12px] text-stone/60">
                ₦{order.delivery_fee.toLocaleString('en-NG')} delivery fee
              </span>
            )}
          </div>
          {/* Address */}
          <div className="flex items-start gap-2">
            <MapPin size={13} className="text-stone/40 mt-0.5 shrink-0" />
            <p className="text-[13px] text-stone/70">{order.delivery_address}</p>
          </div>
          {/* Notes */}
          {order.notes && (
            <div className="bg-white border border-soil/8 rounded-xl px-4 py-3">
              <p className="text-[11px] font-semibold text-stone/40 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[13px] text-soil/75">{order.notes}</p>
            </div>
          )}
          {/* Track order */}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <Link
              href={`/track/${order.id}`}
              className="block text-center bg-pepper text-white text-[13.5px] font-semibold py-2.5 rounded-xl hover:bg-pepper-deep transition-colors"
            >
              Track order
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────
function AccountClientInner({ userId, initialName, initialEmail, initialPhone, referralCode, buyerId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Orders
  const [orders, setOrders]         = useState<Order[]>([])
  const [ordersLoading, setOL]      = useState(true)
  const [ordersError, setOE]        = useState('')

  // Profile edit
  const [name, setName]             = useState(initialName)
  const [phone, setPhone]           = useState(initialPhone)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  // Active tab
  const initialTab = searchParams.get('tab') === 'wallet' ? 'wallet' : 'profile'
  const [tab, setTab]               = useState<'orders' | 'profile' | 'wallet'>(initialTab)
  const [ordersVisible, setOrdersVisible] = useState(false)
  const [copied, setCopied]         = useState(false)

  // Wallet
  const [balance, setBalance]             = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)
  const [transactions, setTransactions]   = useState<WalletTransaction[]>([])
  const [fundAmount, setFundAmount]       = useState('')
  const [funding, setFunding]             = useState(false)
  const [fundError, setFundError]         = useState('')

  // Delivery credit — a separate, delivery-fee-only balance (signup bonus +
  // market-day cashback), summed across every buyers row tied to this
  // account. Distinct from the general wallet above.
  const [deliveryCredit, setDeliveryCredit]               = useState<number | null>(null)
  const [deliveryCreditLoading, setDeliveryCreditLoading] = useState(true)

  useEffect(() => {
    fetch('/api/account/delivery-credits')
      .then(res => res.json())
      .then(data => setDeliveryCredit(Number(data?.available ?? 0)))
      .catch(() => setDeliveryCredit(0))
      .finally(() => setDeliveryCreditLoading(false))
  }, [])

  // ── Fetch wallet ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!buyerId) { setWalletLoading(false); return }
    const supabase = createClient()
    Promise.all([
      supabase.from('wallets').select('balance').eq('buyer_id', buyerId).single(),
      supabase.from('wallet_transactions')
        .select('id, type, amount, reason, balance_after, created_at')
        .eq('buyer_id', buyerId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]).then(([walletRes, txRes]) => {
      setBalance(walletRes.data ? Number(walletRes.data.balance) : 0)
      setTransactions((txRes.data ?? []) as WalletTransaction[])
      setWalletLoading(false)
    })
  }, [buyerId])

  async function handleFundWallet(e: React.FormEvent) {
    e.preventDefault()
    setFundError('')
    const amountNum = Number(fundAmount)
    if (!Number.isFinite(amountNum) || amountNum < 100) {
      setFundError('Enter an amount of at least ₦100.')
      return
    }
    setFunding(true)
    try {
      const res = await fetch('/api/payment/paystack-initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundWallet: true, amount: amountNum }),
      })
      const data = await res.json()
      if (!res.ok || !data.authorizationUrl) {
        setFundError(data.error || 'Could not start payment. Please try again.')
        return
      }
      window.location.href = data.authorizationUrl
    } catch {
      setFundError('Could not reach the server. Check your connection and try again.')
    } finally {
      setFunding(false)
    }
  }

  // ── Fetch orders ────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) { setOL(false); return }

    const supabase = createClient()
    supabase
      .from('my_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setOE('Could not load orders.')
        else setOrders((data ?? []) as Order[])
        setOL(false)
      })
  }, [userId])

  // ── Save profile ─────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name.trim(), phone: phone.trim() },
      })
      if (error) { setSaveMsg('Could not save — try again.'); return }
      setSaveMsg('Saved.')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaveMsg('Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Log out ───────────────────────────────────────────────────────────────────
  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch { /* no-op */ }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#eef1f4] pb-20 sm:pb-0">

      {/* Top bar */}
      <header className="bg-white border-b border-soil/10 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/store" className="flex items-center gap-1.5 text-soil/60 hover:text-soil transition-colors">
            <ChevronLeft size={18} />
            <span className="text-[14px] font-medium">Shop</span>
          </Link>
          <span className="font-body text-soil font-bold text-[17px]">My account</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-stone/50 hover:text-red-500 transition-colors"
          >
            <LogOut size={16} />
            <span className="text-[13px] font-medium hidden sm:block">Log out</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Profile summary pill */}
        <div className="bg-white border border-soil/10 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-pepper flex items-center justify-center text-white text-[18px] font-bold shrink-0">
            {(initialName || initialEmail).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-body text-soil font-bold text-[16px] truncate">{initialName || 'No name set'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mail size={11} className="text-stone/40 shrink-0" />
              <p className="text-stone/50 text-[12.5px] truncate">{initialEmail}</p>
            </div>
            {initialPhone && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Phone size={11} className="text-stone/40 shrink-0" />
                <p className="text-stone/50 text-[12.5px]">{initialPhone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Referral card */}
        {referralCode && (
          <div className="bg-white border border-soil/10 rounded-2xl px-5 py-4 mb-5">
            <p className="text-[12px] font-semibold text-stone/50 uppercase tracking-wider mb-2">Your referral link</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 font-data text-[13px] text-soil truncate bg-[#eef1f4] px-3 py-2 rounded-xl border border-soil/10">
                {typeof window !== 'undefined' ? `${window.location.origin}/ref/${referralCode}` : `/ref/${referralCode}`}
              </p>
              <button
                onClick={() => {
                  const link = `${window.location.origin}/ref/${referralCode}`
                  navigator.clipboard.writeText(link).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }}
                className="shrink-0 w-9 h-9 rounded-xl bg-pepper flex items-center justify-center text-white hover:bg-pepper-deep transition-colors"
              >
                {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={2} />}
              </button>
            </div>
            <p className="text-[12px] text-stone/40 mt-2">Share this link — when someone orders through it, they're credited to you.</p>
          </div>
        )}

        {/* Tabs — short, non-wrapping labels so 3 tabs stay comfortable at
            narrow phone widths; the fuller wording ("Order history",
            "Edit profile") still appears as each panel's own heading. */}
        <div className="flex gap-1 bg-white border border-soil/10 rounded-2xl p-1 mb-5">
          {(['wallet', 'orders', 'profile'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-1 rounded-xl text-[12.5px] sm:text-[13.5px] font-semibold whitespace-nowrap transition-all ${
                tab === t
                  ? 'bg-soil text-white shadow-sm'
                  : 'text-soil/50 hover:text-soil'
              }`}
            >
              {t === 'wallet' ? <Wallet size={14} className="shrink-0" /> : t === 'orders' ? <Package size={14} className="shrink-0" /> : <User size={14} className="shrink-0" />}
              {t === 'wallet' ? 'Wallet' : t === 'orders' ? 'Orders' : 'Profile'}
            </button>
          ))}
        </div>

        {/* Wallet tab */}
        {tab === 'wallet' && (
          <div className="space-y-3">
            <div className="bg-soil rounded-2xl px-5 py-5 text-white">
              <p className="text-[12px] font-semibold text-white/60 uppercase tracking-wider mb-1">Wallet balance</p>
              {walletLoading ? (
                <Loader2 size={20} className="animate-spin text-white/60 mt-1" />
              ) : (
                <p className="font-data text-[28px] font-bold">{fmtNaira(balance ?? 0)}</p>
              )}
              <p className="text-[11.5px] text-white/50 mt-1.5">In-house credit — not withdrawable, used for your WEN orders and rewards.</p>
            </div>

            {(deliveryCreditLoading || (deliveryCredit ?? 0) > 0) && (
              <div className="bg-white border border-soil/10 rounded-2xl px-5 py-4">
                <p className="text-[12px] font-semibold text-stone/50 uppercase tracking-wider mb-1">Delivery credit</p>
                {deliveryCreditLoading ? (
                  <Loader2 size={18} className="animate-spin text-stone/40 mt-1" />
                ) : (
                  <p className="font-data text-[22px] font-bold text-pepper-deep">{fmtNaira(deliveryCredit ?? 0)}</p>
                )}
                <p className="text-[11.5px] text-stone/45 mt-1">
                  From your signup bonus and Market Day cashback — applies automatically to the delivery fee at checkout (up to 25% of it per order), and expires if unused.
                </p>
              </div>
            )}

            <div className="bg-white border border-soil/10 rounded-2xl px-5 py-5">
              <h2 className="font-body text-soil font-bold text-[15px] mb-3">Fund your wallet</h2>
              <form onSubmit={handleFundWallet} className="space-y-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone/50 text-[14.5px]">₦</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    step={1}
                    value={fundAmount}
                    onChange={e => setFundAmount(e.target.value)}
                    placeholder="2,000"
                    className="w-full bg-[#eef1f4] border border-soil/12 rounded-xl pl-8 pr-4 py-3 text-[14.5px] text-soil outline-none focus:border-pepper focus:bg-white transition-all placeholder:text-stone/35"
                  />
                </div>
                {fundError && <p className="text-[12.5px] text-red-500">{fundError}</p>}
                <button
                  type="submit"
                  disabled={funding}
                  className="w-full bg-pepper text-white text-[14.5px] font-semibold py-3.5 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {funding && <Loader2 size={15} className="animate-spin" />}
                  {funding ? 'Starting payment…' : 'Fund with Paystack'}
                </button>
              </form>
            </div>

            <div className="bg-white border border-soil/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-soil/8">
                <h2 className="font-body text-soil font-bold text-[15px]">Recent activity</h2>
              </div>
              {walletLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-stone/40" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-stone/50">No wallet activity yet.</p>
              ) : (
                <div className="divide-y divide-soil/8">
                  {transactions.map(txn => (
                    <div key={txn.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        txn.type === 'credit' ? 'bg-pepper/10' : 'bg-red-50'
                      }`}>
                        {txn.type === 'credit'
                          ? <ArrowDownLeft size={15} className="text-pepper-deep" />
                          : <ArrowUpRight size={15} className="text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-soil text-[13.5px] font-medium truncate">{txn.reason}</p>
                        <p className="text-stone/45 text-[11.5px] mt-0.5">
                          {new Date(txn.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <p className={`font-data text-[13.5px] font-bold shrink-0 ${txn.type === 'credit' ? 'text-pepper-deep' : 'text-red-500'}`}>
                        {txn.type === 'credit' ? '+' : '−'}{fmtNaira(txn.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Orders tab */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {/* Toggle */}
            <button
              onClick={() => setOrdersVisible(v => !v)}
              className="w-full flex items-center justify-between bg-white border border-soil/10 rounded-2xl px-5 py-4 hover:bg-[#eef1f4]/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#eef1f4] flex items-center justify-center">
                  <Package size={16} className="text-pepper" strokeWidth={2} />
                </div>
                <span className="font-body text-soil font-bold text-[15px]">
                  {ordersLoading ? 'Order history' : orders.length === 0 ? 'Order history' : `Order history · ${orders.length}`}
                </span>
              </div>
              <ChevronRight
                size={16}
                className={`text-soil/30 transition-transform ${ordersVisible ? 'rotate-90' : ''}`}
              />
            </button>

            {/* List */}
            {ordersVisible && (
              ordersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={22} className="animate-spin text-stone/40" />
                </div>
              ) : ordersError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-[13px] text-red-600">
                  {ordersError}
                </div>
              ) : orders.length === 0 ? (
                <div className="bg-white border border-soil/10 rounded-2xl px-5 py-12 flex flex-col items-center gap-3 text-center">
                  <p className="font-body text-soil font-bold text-[16px]">No orders yet</p>
                  <p className="text-stone/50 text-[13.5px] max-w-[28ch]">
                    When you place an order from the store, it will appear here.
                  </p>
                  <Link
                    href="/store"
                    className="mt-2 bg-pepper text-white text-[13.5px] font-semibold px-6 py-2.5 rounded-full hover:bg-pepper-deep transition-colors"
                  >
                    Browse the store
                  </Link>
                </div>
              ) : (
                orders.map(o => <OrderCard key={o.id} order={o} />)
              )
            )}
          </div>
        )}

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="bg-white border border-soil/10 rounded-2xl px-5 py-5">
            <h2 className="font-body text-soil font-bold text-[16px] mb-5">Edit profile</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-soil/60 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full bg-[#eef1f4] border border-soil/12 rounded-xl px-4 py-3 text-[14.5px] text-soil outline-none focus:border-pepper focus:bg-white transition-all placeholder:text-stone/35"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-soil/60 mb-1.5">Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full bg-[#eef1f4] border border-soil/12 rounded-xl px-4 py-3 text-[14.5px] text-soil outline-none focus:border-pepper focus:bg-white transition-all placeholder:text-stone/35"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-soil/60 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={initialEmail}
                  disabled
                  className="w-full bg-[#eef1f4]/60 border border-soil/8 rounded-xl px-4 py-3 text-[14.5px] text-stone/50 cursor-not-allowed"
                />
                <p className="text-[11.5px] text-stone/40 mt-1.5">Email cannot be changed here.</p>
              </div>

              {saveMsg && (
                <div className={`px-4 py-2.5 rounded-xl text-[13px] font-medium ${
                  saveMsg === 'Saved.' ? 'bg-pepper/8 text-pepper-deep border border-pepper/20' : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {saveMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-pepper text-white text-[14.5px] font-semibold py-3.5 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-soil/8">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 text-red-500 text-[14px] font-semibold hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </div>
  )
}

// useSearchParams (for the ?tab=wallet deep link from the wallet callback
// page) requires a Suspense boundary around whatever calls it.
export default function AccountClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <AccountClientInner {...props} />
    </Suspense>
  )
}
