'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { getMarketDayInfo, type MarketDayInfo } from '@/lib/market-day'

export function MarketDayBanner({ compact = false }: { compact?: boolean }) {
  const [marketDay] = useState<MarketDayInfo>(() => getMarketDayInfo())

  const message = `Market Day · Order any day, choose Market Day delivery at checkout · 20% off delivery + 5% cashback · Next delivered on ${marketDay.nextMarketDayWeekday}`

  return (
    <section aria-label="Market Day offer" className="w-full min-w-0 overflow-hidden bg-soil text-white">
      <div className="market-day-marquee flex min-w-max items-center py-3.5">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center gap-8 px-5" aria-hidden={copy === 1}>
            <span className="flex items-center gap-2 font-data text-[11px] font-bold uppercase tracking-[0.16em] text-leaf">
              <CalendarDays size={15} strokeWidth={2.2} />
              Market Day
            </span>
            <span className="text-[13px] font-semibold text-white/90">{message}</span>
            <span className="h-1 w-1 rounded-full bg-leaf" aria-hidden="true" />
            <Link
              href="/store"
              tabIndex={copy === 1 ? -1 : undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-leaf px-3.5 py-1.5 text-[11px] font-bold text-soil transition-colors hover:bg-leaf-deep"
            >
              Shop Market Day
              <ArrowRight size={13} />
            </Link>
            <span className="h-1 w-1 rounded-full bg-leaf" aria-hidden="true" />
          </div>
        ))}
      </div>
      <p className="sr-only">{message}. Select Market Day delivery at checkout to get the saving.</p>
    </section>
  )
}