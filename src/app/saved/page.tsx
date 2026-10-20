'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Heart, Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_IMAGES } from '@/lib/category-images'
import { useCart } from '@/context/CartContext'
import { useSaved } from '@/lib/useSaved'
import { FALLBACK_PRODUCTS, type Product } from '@/lib/fallback-products'
import { BottomTabBar } from '@/components/BottomTabBar'

function fmt(price: number | null) {
  if (!price) return '—'
  return '₦' + price.toLocaleString('en-NG')
}

export default function SavedPage() {
  const router = useRouter()
  const { savedIds, toggle } = useSaved()
  const { items, addOne } = useCart()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  // savedIds starts empty until the localStorage read effect runs — wait one
  // tick so we don't flash "It's empty in here" before we've actually checked.
  useEffect(() => { setHydrated(true) }, [])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    async function load() {
      if (savedIds.length === 0) { setProducts([]); setLoading(false); return }
      setLoading(true)
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          if (!cancelled) setProducts(FALLBACK_PRODUCTS.filter((p) => savedIds.includes(p.id)))
          return
        }
        const supabase = createClient()
        const { data } = await supabase
          .from('products')
          .select('id, name, category, unit, price, image_url, is_available')
          .in('id', savedIds)
        if (cancelled) return
        const fromDb = data ?? []
        const dbIds = new Set(fromDb.map((p) => p.id))
        const fromFallback = FALLBACK_PRODUCTS.filter((p) => savedIds.includes(p.id) && !dbIds.has(p.id))
        setProducts([...fromDb, ...fromFallback])
      } catch {
        if (!cancelled) setProducts(FALLBACK_PRODUCTS.filter((p) => savedIds.includes(p.id)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [hydrated, savedIds])

  return (
    <div className="min-h-screen bg-white pb-20 sm:pb-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-soil/6">
        <button onClick={() => router.back()} aria-label="Back" className="p-2 -ml-2 text-soil">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-body text-soil text-[18px] font-bold flex-1">Saved</h1>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-stone/40" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-grain-dim flex items-center justify-center">
              <Heart size={26} className="text-stone/30" strokeWidth={1.5} />
            </div>
            <p className="font-body text-soil text-[16px] font-semibold">It&apos;s empty in here</p>
            <p className="text-stone/50 text-[13.5px] max-w-[28ch]">
              Tap the heart on any product to save it here for later.
            </p>
            <Link
              href="/store"
              className="mt-2 bg-pepper text-white text-[13.5px] font-semibold px-6 py-2.5 rounded-full hover:bg-pepper-deep transition-colors"
            >
              Browse the store
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.map((p) => {
              const img = p.image_url || CATEGORY_IMAGES[p.category] || CATEGORY_IMAGES.other
              const inCart = items[p.id]
              return (
                <div key={p.id} className="bg-white rounded-2xl overflow-hidden ring-1 ring-soil/8 hover:ring-soil/15 transition-all">
                  <div className="relative aspect-square bg-grain-dim">
                    <Link href={`/store/${p.id}`} className="block w-full h-full">
                      <img src={img} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                    </Link>
                    <button
                      onClick={() => toggle(p.id)}
                      aria-label="Remove from saved"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm"
                    >
                      <Heart size={14} className="fill-pepper text-pepper" />
                    </button>
                  </div>
                  <div className="px-3 pt-2.5 pb-3">
                    <Link href={`/store/${p.id}`}>
                      <p className="text-soil text-[13.5px] font-semibold leading-snug truncate">{p.name}</p>
                    </Link>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="text-soil text-[14px] font-bold">{fmt(p.price)}</span>
                      <button
                        type="button"
                        onClick={() => addOne({
                          id: p.id, name: p.name, category: p.category, unit: p.unit,
                          price: p.price, imageUrl: img,
                        })}
                        className="shrink-0 h-8 w-8 rounded-full bg-soil hover:bg-pepper text-white flex items-center justify-center transition-colors active:scale-95"
                        aria-label={`Add ${p.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {inCart && (
                      <p className="text-pepper text-[11px] font-semibold mt-1">{inCart.quantity} in cart</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </div>
  )
}
