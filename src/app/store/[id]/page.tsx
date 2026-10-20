'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Heart, Share2, Minus, Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_IMAGES } from '@/lib/category-images'
import { categoryMeta } from '@/lib/categories'
import { useCart } from '@/context/CartContext'
import { useSaved } from '@/lib/useSaved'
import { FALLBACK_PRODUCTS, type Product } from '@/lib/fallback-products'

function fmt(price: number | null) {
  if (!price) return '—'
  return '₦' + price.toLocaleString('en-NG')
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { items, addOne, setQty } = useCart()
  const { isSaved, toggle } = useSaved()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [qty, setLocalQty] = useState(1)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const id = params.id as string
      const fallback = FALLBACK_PRODUCTS.find((p) => p.id === id)
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          if (!cancelled) { setProduct(fallback ?? null); setNotFound(!fallback) }
          return
        }
        const supabase = createClient()
        const { data } = await supabase
          .from('products')
          .select('id, name, category, unit, price, image_url, is_available')
          .eq('id', id)
          .maybeSingle()
        if (cancelled) return
        if (data) setProduct(data)
        else if (fallback) setProduct(fallback)
        else setNotFound(true)
      } catch {
        if (!cancelled) {
          if (fallback) setProduct(fallback)
          else setNotFound(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [params.id])

  const inCart = product ? items[product.id] : undefined
  const cat = product ? categoryMeta(product.category) : undefined
  const img = product?.image_url || (product ? CATEGORY_IMAGES[product.category] : null) || CATEGORY_IMAGES.other

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.name ?? 'WEN', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch { /* user cancelled share sheet — no-op */ }
  }

  function handleAddToCart() {
    if (!product) return
    if (inCart) {
      setQty(product.id, inCart.quantity + qty)
    } else {
      addOne({
        id: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        price: product.price,
        imageUrl: img,
      })
      if (qty > 1) setQty(product.id, qty)
    }
    router.push('/cart')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-stone/40" />
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-body text-soil text-[17px] font-semibold">Product not found</p>
        <Link href="/store" className="text-pepper text-[14px] font-semibold">Back to store</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-soil/6">
        <button onClick={() => router.back()} aria-label="Back" className="p-2 -ml-2 text-soil">
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggle(product.id)}
            aria-label={isSaved(product.id) ? 'Remove from saved' : 'Save product'}
            className="p-2 text-soil"
          >
            <Heart size={20} className={isSaved(product.id) ? 'fill-pepper text-pepper' : ''} />
          </button>
          <button onClick={handleShare} aria-label="Share" className="p-2 text-soil relative">
            <Share2 size={19} />
            {shared && (
              <span className="absolute -bottom-7 right-0 bg-soil text-white text-[11px] px-2 py-1 rounded-lg whitespace-nowrap">
                Link copied
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="aspect-square bg-grain-dim">
        <img src={img} alt={product.name} className="w-full h-full object-cover" />
      </div>

      <div className="px-5 sm:px-8 pt-5 max-w-2xl mx-auto">
        {/* Title + price */}
        <div className="flex items-start justify-between gap-4 mb-1.5">
          <h1 className="font-body text-soil text-[22px] font-bold leading-tight">{product.name}</h1>
          <p className="text-pepper text-[20px] font-bold shrink-0">{fmt(product.price)}</p>
        </div>

        {/* Category + unit line */}
        {cat && (
          <div className="flex items-center gap-2 mb-6">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cat.tint}`}>
              <cat.Icon size={12} strokeWidth={2.2} />
            </span>
            <span className="text-stone/60 text-[13.5px] font-medium">
              {cat.label}{product.unit ? ` · ${product.unit}` : ''}
            </span>
            {!product.is_available && (
              <span className="text-[11px] font-semibold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full ml-1">
                Unavailable
              </span>
            )}
          </div>
        )}

        {/* Quantity */}
        <div className="mb-6">
          <p className="text-[12px] font-semibold text-soil/60 uppercase tracking-wide mb-2.5">Quantity</p>
          <div className="inline-flex items-center bg-grain-dim rounded-2xl border border-soil/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setLocalQty((q) => Math.max(1, q - 1))}
              className="w-11 h-11 flex items-center justify-center text-soil hover:bg-soil/5 transition-colors"
              aria-label="Decrease quantity"
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center font-data font-bold text-soil text-[15px] tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setLocalQty((q) => q + 1)}
              className="w-11 h-11 flex items-center justify-center text-soil hover:bg-soil/5 transition-colors"
              aria-label="Increase quantity"
            >
              <Plus size={16} />
            </button>
          </div>
          {product.unit && (
            <span className="ml-3 text-stone/50 text-[13px]">{product.unit}{qty > 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Description */}
        {cat && (
          <div className="mb-8">
            <p className="text-[12px] font-semibold text-soil/60 uppercase tracking-wide mb-2">Description</p>
            <p className="text-soil/75 text-[14.5px] leading-relaxed">{cat.blurb}</p>
          </div>
        )}
      </div>

      {/* Sticky add to cart */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-soil/10 px-5 sm:px-8 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!product.is_available}
            className="flex-1 bg-pepper hover:bg-pepper-deep disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-[15px] py-3.5 rounded-2xl transition-colors"
          >
            {product.is_available ? 'Add to cart' : 'Currently unavailable'}
          </button>
        </div>
      </div>
    </div>
  )
}
