'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  LogOut,
  Menu,
  X,
  Package,
  LayoutDashboard,
} from 'lucide-react'

const ADMIN_LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList, short: 'Orders' },
  { href: '/admin/products', label: 'Products', icon: Package, short: 'Items' },
  { href: '/admin/farmers', label: 'Farmers', icon: Users, short: 'Farm' },
  { href: '/admin/buyers', label: 'Buyers', icon: ShoppingCart, short: 'Buy' },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, short: 'Stats' },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="min-h-screen flex bg-grain-dim">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-soil text-grain flex-col shrink-0">
        <div className="px-6 py-6">
          <p className="font-display text-xl">WEN</p>
          <p className="font-data text-[10px] text-grain/40 uppercase tracking-widest mt-0.5">Admin</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {ADMIN_LINKS.map((link) => {
            const Icon = link.icon
            const active = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href + '/'))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
                  active ? 'bg-grain/10 text-grain' : 'text-grain/60 hover:text-grain hover:bg-grain/5'
                }`}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 py-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-grain/60 hover:text-grain hover:bg-grain/5 transition-colors w-full"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-soil text-grain px-3 h-12 flex items-center justify-between shrink-0 safe-top">
          <div className="min-w-0">
            <p className="font-display text-base leading-none">WEN</p>
            <p className="font-data text-[9px] text-grain/40 uppercase tracking-widest truncate">
              Admin
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-grain/60 hover:text-grain"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="p-2 text-grain/80 hover:text-grain"
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {/* Mobile overflow menu (extra links if needed) */}
        {open && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="fixed top-12 left-0 right-0 z-50 bg-soil text-grain px-3 py-3 space-y-1 md:hidden shadow-xl border-b border-grain/10">
              {ADMIN_LINKS.map((link) => {
                const Icon = link.icon
                const active = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-lg text-[14px] ${
                      active ? 'bg-grain/10 text-grain' : 'text-grain/70'
                    }`}
                  >
                    <Icon size={16} />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tabs — thumb friendly */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-soil/10 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-6 max-w-lg mx-auto">
            {ADMIN_LINKS.map((link) => {
              const Icon = link.icon
              const active = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href + '/'))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.25rem] text-[10px] font-medium ${
                    active ? 'text-pepper' : 'text-soil/40'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.75} />
                  <span className="leading-none">{link.short}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
