'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/Logo'

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-grain-dim flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-stone/40" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const searchParams = useSearchParams()
  const nextPath = searchParams?.get('next') ?? '/store'
  const [step, setStep]           = useState<'form' | 'check-email'>('form')
  const [showPwd, setShowPwd]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm]           = useState({
    fullName: '', email: '', phone: '', password: '', confirm: '',
  })
  const [errors, setErrors]       = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email'
    if (!/^0[789][01]\d{8}$/.test(form.phone.trim())) e.phone = 'Enter a valid Nigerian phone number'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.fullName.trim(), phone: form.phone.trim() },
      },
    })
    setLoading(false)
    if (error) {
      if (error.message.includes('already registered')) {
        setError('An account with this email already exists. Try logging in instead.')
      } else {
        setError(error.message)
      }
      return
    }
    setStep('check-email')
  }

  // ── Check email screen ──────────────────────────────────────────────────
  if (step === 'check-email') {
    return (
      <div className="min-h-screen bg-grain-dim flex flex-col items-center justify-center px-5 py-12">
        <Logo height={40} className="mb-10" />
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-pepper/10 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-pepper">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>
            </svg>
          </div>
          <h1 className="font-body text-soil text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-stone/60 text-[14px] leading-relaxed mb-2">
            We sent a confirmation link to
          </p>
          <p className="font-semibold text-soil text-[15px] mb-6">{form.email}</p>
          <p className="text-stone/50 text-[13px] leading-relaxed mb-8">
            Click the link in that email to activate your account, then come back and log in.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors"
          >
            Go to login
          </Link>
          <p className="text-[12px] text-stone/40 mt-4">Didn&apos;t get it? Check your spam folder.</p>
        </div>
      </div>
    )
  }

  // ── Signup form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-grain-dim flex flex-col items-center justify-center px-5 py-12">
      <Logo height={40} className="mb-10" />

      <div className="w-full max-w-sm">
        <h1 className="font-body text-soil text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-stone/60 text-[14px] mb-2">Fresh produce, delivered to your door.</p>
        <p className="inline-block bg-pepper/8 text-pepper-deep text-[12.5px] font-semibold px-3 py-1.5 rounded-full mb-6">
          Get ₦500 delivery credit when you sign up
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Full name */}
          <div>
            <label className="block text-[13px] font-medium text-soil/70 mb-1.5">Full name</label>
            <input
              type="text"
              autoComplete="name"
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              placeholder="Your full name"
              className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-soil outline-none focus:border-pepper transition-colors placeholder:text-stone/35 ${errors.fullName ? 'border-red-400' : 'border-soil/12'}`}
            />
            {errors.fullName && <p className="text-[12px] text-red-500 mt-1">{errors.fullName}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-[13px] font-medium text-soil/70 mb-1.5">Email address</label>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-soil outline-none focus:border-pepper transition-colors placeholder:text-stone/35 ${errors.email ? 'border-red-400' : 'border-soil/12'}`}
            />
            {errors.email && <p className="text-[12px] text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[13px] font-medium text-soil/70 mb-1.5">Phone number</label>
            <input
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="08012345678"
              className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-soil outline-none focus:border-pepper transition-colors placeholder:text-stone/35 ${errors.phone ? 'border-red-400' : 'border-soil/12'}`}
            />
            {errors.phone && <p className="text-[12px] text-red-500 mt-1">{errors.phone}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-[13px] font-medium text-soil/70 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                className={`w-full bg-white border rounded-xl px-4 py-3.5 pr-12 text-[15px] text-soil outline-none focus:border-pepper transition-colors placeholder:text-stone/35 ${errors.password ? 'border-red-400' : 'border-soil/12'}`}
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-stone/40 hover:text-soil transition-colors">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-[12px] text-red-500 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-[13px] font-medium text-soil/70 mb-1.5">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })}
                placeholder="Repeat your password"
                className={`w-full bg-white border rounded-xl px-4 py-3.5 pr-12 text-[15px] text-soil outline-none focus:border-pepper transition-colors placeholder:text-stone/35 ${errors.confirm ? 'border-red-400' : 'border-soil/12'}`}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-stone/40 hover:text-soil transition-colors">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && <p className="text-[12px] text-red-500 mt-1">{errors.confirm}</p>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-[14px] text-stone/60 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-pepper font-semibold hover:text-pepper-deep transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
