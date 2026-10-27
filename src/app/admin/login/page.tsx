'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-soil flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="font-display text-grain text-2xl text-center mb-8">WEN Admin</p>
        <form onSubmit={handleSubmit} className="bg-grain rounded-2xl p-7 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-soil mb-1.5">Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-soil/15 rounded-lg px-4 py-2.5 text-[14px] outline-none focus:border-pepper transition-colors bg-white" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-soil mb-1.5">Password</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-soil/15 rounded-lg px-4 py-2.5 text-[14px] outline-none focus:border-pepper transition-colors bg-white" />
          </div>
          {error && <p className="text-[13px] text-pepper">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-pepper text-grain py-3 rounded-lg text-[14px] font-medium hover:bg-pepper-deep transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in...</> : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  )
}
