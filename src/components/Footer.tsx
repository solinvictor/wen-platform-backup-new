import Link from 'next/link'
import { ACTIVE_CATEGORY_META } from '@/lib/categories'

const COLS = [
  {
    title: 'Shop',
    links: [
      { href: '/store', label: 'Order from WEN' },
      ...ACTIVE_CATEGORY_META.map((c) => ({ href: `/store?c=${c.slug}`, label: c.label })),
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/buyers', label: 'For businesses' },
    ],
  },
  {
    title: 'Partners',
    links: [
      { href: '/farmers', label: 'Become a supplier' },
      { href: '/buyers', label: 'Join as a buyer' },
      { href: '/login', label: 'Log in' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/#faq', label: 'FAQ' },
      { href: '/contact', label: 'Contact us' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="market-board text-grain/70 mt-auto">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 sm:gap-10 mb-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <p className="font-display text-2xl text-grain mb-3">WEN</p>
            <p className="text-[13px] leading-relaxed text-grain/60 max-w-[16rem]">
              Start small. Buy better. {ACTIVE_CATEGORY_META.map((c) => c.label).join(', ')} — for kitchens that buy regularly.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-grain/40 mb-3">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-[13px] text-grain/65 hover:text-grain transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-grain/10 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px] text-grain/40">
          <span>© {new Date().getFullYear()} WEN. Nigeria.</span>
          <span>Mon – Sat · 9:00 AM – 6:00 PM</span>
        </div>
      </div>
    </footer>
  )
}
