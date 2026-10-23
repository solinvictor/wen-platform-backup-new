'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronLeft, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { CATEGORY_IMAGES } from '@/lib/category-images'
import { categoryMeta } from '@/lib/categories'
import { getMarketDayInfo, type MarketDayInfo } from '@/lib/market-day'

function fmt(n: number | null) {
  if (!n) return '—'
  return '₦' + n.toLocaleString('en-NG')
}

export default function CartPage() {
  const router = useRouter()
  const { cartLines, cartCount, cartTotal, addOne, removeOne, deleteLine } = useCart()
  const hasPrices = cartLines.some((l) => l.price)
  const [marketDay, setMarketDay] = useState<MarketDayInfo | null>(null)
  useEffect(() => {
    setMarketDay(getMarketDayInfo())
  }, [])
  const estimatedTotal = hasPrices ? cartTotal : null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-soil/6">
        <button onClick={() => router.back()} aria-label="Back" className="p-2 -ml-2 text-soil">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-body text-soil text-[18px] font-bold flex-1">My Cart</h1>
        {cartCount > 0 && (
          <span className="text-stone/50 text-[13px] font-medium">
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {cartLines.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-grain-dim flex items-center justify-center">
            <ShoppingBag size={32} className="text-stone/30" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-body text-soil text-[17px] font-semibold mb-1">Your cart is empty</p>
            <p className="text-stone/55 text-[13px] leading-relaxed">Add some fresh produce to get started.</p>
          </div>
          <Link
            href="/store"
            className="mt-2 bg-pepper text-white text-[14px] font-semibold px-8 py-3 rounded-full hover:bg-pepper-deep transition-colors"
          >
            Browse produce
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-4 space-y-3 pb-6">
            {cartLines.map((line) => {
              const img = line.imageUrl || CATEGORY_IMAGES[line.category] || CATEGORY_IMAGES.other
              const cat = categoryMeta(line.category)
              const lineTotal = line.price ? line.price * line.quantity : null

              return (
                <div key={line.id} className="flex items-center gap-3.5 bg-white border border-soil/8 rounded-2xl p-3">
                  <Link href={`/store/${line.id}`} className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-soil/8 block">
                    <img src={img} alt={line.name} className="w-full h-full object-cover" />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link href={`/store/${line.id}`} className="text-soil text-[14.5px] font-semibold leading-tight truncate block">
                      {line.name}
                    </Link>
                    <p className="text-stone/50 text-[12px] mt-0.5">
                      {cat?.label ?? line.category}{line.unit ? ` · ${line.unit}` : ''}
                    </p>
                    {lineTotal != null && (
                      <p className="text-pepper-deep text-[13px] font-bold mt-1">{fmt(lineTotal)}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => deleteLine(line.id)}
                      className="text-stone/30 hover:text-red-400 transition-colors p-0.5"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex items-center gap-2 bg-grain-dim border border-soil/10 rounded-full px-1 py-1">
                      <button
                        onClick={() => removeOne(line.id)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-white rounded-full transition-colors"
                        aria-label="Decrease"
                      >
                        <Minus size={12} className="text-soil" />
                      </button>
                      <span className="text-soil text-[12.5px] font-bold font-data w-4 text-center">{line.quantity}</span>
                      <button
                        onClick={() => addOne({ id: line.id, name: line.name, category: line.category, unit: line.unit, price: line.price, imageUrl: line.imageUrl })}
                        className="w-6 h-6 flex items-center justify-center hover:bg-white rounded-full transition-colors"
                        aria-label="Increase"
                      >
                        <Plus size={12} className="text-soil" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sticky checkout bar */}
          <div className="sticky bottom-0 border-t border-soil/8 bg-white px-4 sm:px-6 pt-4 pb-6 space-y-3">
            <div className="max-w-2xl mx-auto w-full space-y-3">
              {marketDay && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-pepper/8 px-3.5 py-2.5 text-[12px]">
                  <span className="font-medium text-pepper-deep">
                    Market Day · 20% off delivery + 5% cashback — pick it at checkout
                  </span>
                </div>
              )}
              {hasPrices && (
                <div className="flex items-center justify-between">
                  <span className="text-soil/60 text-[14px]">Estimated total</span>
                  <span className="font-body text-soil text-[19px] font-bold">{fmt(estimatedTotal)}</span>
                </div>
              )}
              <button
                onClick={() => router.push('/checkout')}
                className="w-full bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Checkout
                {hasPrices && <span className="opacity-80">· {fmt(estimatedTotal)}</span>}
              </button>
              <p className="text-center text-stone/40 text-[11px]">
                Prices confirmed by farmer before delivery
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
