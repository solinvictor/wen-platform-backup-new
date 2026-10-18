'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Loader2, Wallet } from 'lucide-react'
import { Logo } from '@/components/Logo'

type VerifyState = 'checking' | 'funded' | 'failed'

function CallbackContent() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<VerifyState>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
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
        if (data.paid) setState('funded')
        else {
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
          <p className="text-soil/60 text-[14px]">Confirming your top-up…</p>
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
            <h1 className="font-body text-soil text-2xl font-bold mb-1.5">Top-up not confirmed</h1>
            <p className="text-stone/60 text-[14px] leading-relaxed mb-6">
              {error || 'Something went wrong confirming your payment. If money left your account, it will be reversed automatically.'}
            </p>
            <Link
              href="/account?tab=wallet"
              className="w-full inline-flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors"
            >
              Back to wallet
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // ── Funded ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#eef1f4] flex flex-col">
      <header className="bg-white border-b border-soil/8 px-5 h-14 flex items-center justify-between">
        <Logo height={24} />
        <span className="text-[11px] font-mono uppercase tracking-wider text-pepper">Funded</span>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 sm:px-5 py-10">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-pepper/10 flex items-center justify-center mx-auto mb-4 ring-4 ring-pepper/5">
            <CheckCircle2 size={32} className="text-pepper" strokeWidth={1.8} />
          </div>
          <h1 className="font-body text-soil text-2xl font-bold mb-1.5">Wallet funded</h1>
          <p className="text-stone/60 text-[14px] leading-relaxed mb-6">
            Your payment went through and your wallet balance has been updated.
          </p>
          <Link
            href="/account?tab=wallet"
            className="w-full inline-flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors"
          >
            <Wallet size={17} />
            View my wallet
          </Link>
        </div>
      </main>
    </div>
  )
}

export default function WalletCallbackPage() {
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
