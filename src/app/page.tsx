'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { ArrowRight, Plus } from 'lucide-react'
import { CATEGORY_IMAGES, HOME_CARD_IMAGES } from '@/lib/category-images'
import { ACTIVE_CATEGORY_META } from '@/lib/categories'
import { Logo } from '@/components/Logo'
import { HeroVideos } from '@/components/HeroVideos'
import { HERO_VIDEOS } from '@/lib/hero-videos'
// Only categories marked active in lib/categories.ts are orderable right now —
// bring one back there and it reappears here automatically.
const FALLBACK_PRICE: Record<string, number> = {
  chicken: 2400,
  eggs: 5700,
}

// Fallback unit shown only until the real DB row loads (WeeklyAvailability
// below overrides this with the actual product's unit once fetched).
const FALLBACK_UNIT: Record<string, string> = {
  chicken: 'kg', eggs: 'crate', fish: 'kg', rice: 'bag', beans: 'bag',
}

const CATEGORIES = ACTIVE_CATEGORY_META.map((c) => ({
  label: c.label,
  slug: c.slug,
  unit: FALLBACK_UNIT[c.slug] ?? 'unit',
  img: CATEGORY_IMAGES[c.slug],
  body: c.blurb,
}))

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'We Source',
    body: 'We find the best available deals from our selected suppliers.',
    img: '/landing/steps/01-source-greenhouse.jpg',
    imgAlt: 'Smiling grower carrying a crate of fresh lettuce in a greenhouse',
  },
  {
    step: '02',
    title: 'We List',
    body: "We show you what's available and the current price.",
    img: '/landing/steps/02-list-market.jpg',
    imgAlt: 'Crates of fresh grapes, pomegranates and oranges at a produce market',
  },
  {
    step: '03',
    title: 'You Order',
    body: 'Pick what you need from the store.',
    img: '/landing/steps/03-order-phone.jpg',
    imgAlt: 'Person holding a phone showing an order payment success screen',
  },
  {
    step: '04',
    title: 'We Deliver',
    body: 'We coordinate fulfilment and get it to you.',
    img: '/landing/steps/04-deliver-door.jpg',
    imgAlt: 'Delivery man handing over a paper bag of fresh groceries at a door',
  },
]


const FAQS = [
  {
    q: 'What areas do you deliver to?',
    a: 'We deliver across Nigeria. Add your address at checkout and we’ll confirm before anything ships.',
  },
  {
    q: 'How much is delivery, and how long does it take?',
    a: 'Delivery is ₦200 per km from our dispatch point. On Market Days (Wednesday and Saturday) you get 20% off the delivery fee, plus 5% of your order back as cash in your wallet (capped at ₦500). Final cost is shown at checkout before you pay.',
  },
  {
    q: 'What is delivery credit?',
    a: 'A balance that only goes toward your delivery fee — not the rest of your order. You get ₦500 of it when you sign up, plus more from Market Day orders. It’s applied automatically at checkout (up to 25% of that order’s delivery fee) and expires if unused, so it’s worth placing an order soon after you get some.',
  },
  {
    q: 'What can I actually order from WEN?',
    a: 'Chicken and eggs. We’re starting narrow on purpose — more staples (fish, rice, beans) are coming as we scale.',
  },
  {
    q: 'How do I pay?',
    a: 'Card or bank transfer at checkout. Payments are handled securely, and your final price is confirmed before delivery goes out.',
  },
  {
    q: 'Can I set up recurring orders?',
    a: 'Yes. If your kitchen buys the same things every week, set a subscription once and pick how often it repeats — no reordering from scratch.',
  },
  {
    q: 'I farm or supply produce — how do I sell through WEN?',
    a: 'Apply as a supplier. We work with a selected group who can consistently deliver what we list, not everyone who signs up.',
  },
]

function FAQItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string
  a: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-soil/10 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-body text-soil text-[15px] sm:text-[16px] font-semibold pr-2">
          {q}
        </span>
        <Plus
          size={18}
          className={`shrink-0 text-pepper transition-transform duration-200 ${
            open ? 'rotate-45' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100 pb-5' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-soil/70 text-[14px] leading-relaxed pr-8">{a}</p>
        </div>
      </div>
    </div>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="bg-grain py-14 sm:py-20 scroll-mt-24">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="font-data text-[11px] text-pepper uppercase tracking-[0.2em] mb-3">
          Questions?
        </p>
        <h2 className="font-display text-soil text-2xl sm:text-3xl mb-6">Good to know</h2>
        <div className="wen-surface px-5 sm:px-6">
          {FAQS.map((item, i) => (
            <FAQItem
              key={item.q}
              q={item.q}
              a={item.a}
              open={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function fmtPrice(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return null
  return `₦${n.toLocaleString('en-NG')}`
}

type BoardRow = {
  slug: string
  label: string
  unit: string
  price: number | null
  href: string
}

function WeeklyBoard() {
  const [rows, setRows] = useState<BoardRow[]>(
    CATEGORIES.map((c) => ({
      slug: c.slug,
      label: c.label,
      unit: c.unit,
      price: FALLBACK_PRICE[c.slug] ?? null,
      href: `/store?c=${c.slug}`,
    }))
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { createClient } = require('@/lib/supabase/client')
        const supabase = createClient()
        const { data } = await supabase
          .from('products')
          .select('name, category, unit, price, is_available')
          .eq('is_available', true)

        if (cancelled) return

        type Prod = {
          name: string
          category: string
          unit: string | null
          price: number | null
        }
        const products = (data || []) as Prod[]

        setRows(
          CATEGORIES.map((c) => {
            const inCat = products.filter(
              (p) =>
                p.category === c.slug ||
                p.name.toLowerCase().includes(c.slug) ||
                p.name.toLowerCase().includes(c.label.toLowerCase())
            )
            // Prefer a row with a real price; if several, take the lowest
            const withPrice = inCat
              .filter((p) => p.price != null && Number(p.price) > 0)
              .sort((a, b) => Number(a.price) - Number(b.price))
            const pick = withPrice[0] || inCat[0]
            const unitRaw = pick?.unit?.replace(/^per\s+/i, '') || c.unit
            const livePrice = pick?.price != null ? Number(pick.price) : null
            return {
              slug: c.slug,
              label: c.label,
              unit: unitRaw,
              price: livePrice ?? FALLBACK_PRICE[c.slug] ?? null,
              href: `/store?c=${c.slug}`,
            }
          })
        )
      } catch {
        /* keep category fallbacks */
      } finally {
        /* fallback prices already cover the unloaded state; nothing to flag here */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-soil/55 backdrop-blur-md rounded-2xl p-3 sm:p-4 shadow-xl w-full max-w-[22rem]">
      <div className="bg-leaf rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-soil uppercase tracking-wide">
          This week, WEN has
        </p>
      </div>
      <ul className="mt-2.5 space-y-0.5">
        {rows.map((r) => {
          const price = fmtPrice(r.price)
          return (
            <li key={r.slug}>
              <Link
                href={r.href}
                className="px-3 py-1.5 flex items-baseline justify-between gap-3 rounded-md hover:bg-white/10 transition-colors"
              >
                <span className="text-grain text-[13px]">{r.label}</span>
                <span className="text-grain text-[13px] tabular-nums text-right shrink-0">
                  {price ? (
                    <>
                      {price} <span className="text-grain/70">per {r.unit}</span>
                    </>
                  ) : (
                    <span className="text-leaf font-semibold">See store</span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FeaturedProducts() {
  const [products, setProducts] = useState(
    CATEGORIES.map((c, i) => ({
      id: String(i),
      name: c.label,
      category: c.slug,
      unit: `per ${c.unit}`,
      image_url: c.img,
      price: null as number | null,
    }))
  )

  useEffect(() => {
    try {
      const { createClient } = require('@/lib/supabase/client')
      const supabase = createClient()
      const activeSlugs = ACTIVE_CATEGORY_META.map((c) => c.slug)
      supabase
        .from('products')
        .select('id, name, category, unit, image_url, price')
        .eq('is_available', true)
        .in('category', activeSlugs) // never tease a category that's disabled on /store
        .limit(8)
        .then(({ data }: { data: typeof products | null }) => {
          if (data && data.length > 0) setProducts(data as typeof products)
        })
    } catch {
      /* keep fallbacks */
    }
  }, [])

  return (
    <section className="bg-mint py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <p className="text-navy text-[12px] sm:text-[13px] font-bold uppercase tracking-wide text-center mb-8 sm:mb-10">
          What&apos;s available this week?
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((p) => {
            const unit = p.unit ? (/^per\s/i.test(p.unit) ? p.unit : `per ${p.unit}`) : null
            return (
              <Link
                key={p.id}
                href={`/store?c=${p.category}`}
                className="group block rounded-[1.75rem] overflow-hidden bg-white shadow-[0_4px_20px_rgba(2,42,67,0.08)] hover:shadow-[0_8px_28px_rgba(2,42,67,0.14)] transition-shadow"
              >
                <div className="aspect-[10/9] bg-white overflow-hidden">
                  <img
                    src={HOME_CARD_IMAGES[p.category] || p.image_url || CATEGORY_IMAGES[p.category] || CATEGORY_IMAGES.other}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="bg-leaf px-5 py-4">
                  <p className="font-display text-navy text-xl font-bold leading-none truncate">{p.name}</p>
                  {unit && (
                    <p className="text-navy/70 text-[10px] font-bold uppercase tracking-wide mt-1.5 leading-none">{unit}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  return (
    <>
      <Nav />

      <main>
        {/* ── Hero (mobile only): headline + buttons on plain mint, video as its
            own block below with no overlay. Desktop keeps the original style
            (text + buttons overlaid directly on the video), built below. ── */}
        <section className="sm:hidden bg-mint pt-10 pb-8">
          <div className="max-w-6xl mx-auto px-5 text-center">
            <h1
              className="text-navy leading-[1.2] mb-6 mx-auto max-w-[13ch]"
              style={{ fontSize: 'clamp(24px, 5vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em' }}
            >
              We found a better way to <span className="font-extrabold">buy food.</span>
            </h1>
            <div className="flex flex-row flex-nowrap items-center justify-center gap-2.5">
              <Link
                href="/store"
                className="inline-flex items-center justify-center bg-leaf hover:bg-leaf-deep text-navy font-semibold text-[13px] px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
              >
                Start Buying
              </Link>
              <Link
                href="/farmers"
                className="inline-flex items-center justify-center border border-navy/25 text-navy hover:bg-navy/5 font-semibold text-[13px] px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
              >
                Become a Supplier
              </Link>
            </div>
          </div>
        </section>

        {/* ── Hero video ── One <HeroVideos> only (never two — that would mean two
            video players loading/playing at once, wasted data for no reason).
            Desktop (sm and up): text + buttons overlaid on it with the navy
            gradient, the original style. Mobile: just the video, no overlay,
            no text here — the text and buttons already rendered in the mint
            section above. ── */}
        <section className="relative overflow-hidden min-h-[280px] sm:min-h-[520px] flex items-end sm:items-center bg-navy">
          <HeroVideos sources={HERO_VIDEOS} />

          {/* Desktop-only dark gradient, so desktop text stays readable over the video */}
          <div
            className="hidden sm:block absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(2,42,67,0.90) 0%, rgba(2,42,67,0.86) 55%, rgba(2,42,67,0.5) 78%, rgba(2,42,67,0.3) 100%)',
            }}
          />

          {/* One shared wrapper — this is the only thing the section's flex
              centers/anchors, so its children (desktop headline, then the card)
              stack normally instead of getting laid out as flex siblings. */}
          <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-6 sm:pb-0 pt-0 sm:pt-16 w-full">
            {/* Desktop-only headline + buttons, overlaid on the video */}
            <div className="hidden sm:block">
              <h1
                className="text-grain leading-[1.08] mb-7 max-w-[11ch] sm:max-w-[14ch]"
                style={{ fontSize: 'clamp(38px, 7vw, 68px)', fontWeight: 500, letterSpacing: '-0.02em' }}
              >
                We found a better way to{' '}
                <span className="text-leaf font-extrabold block">buy food.</span>
              </h1>
              <div className="flex flex-row flex-nowrap gap-3 mb-8">
                <Link
                  href="/store"
                  className="inline-flex items-center justify-center bg-leaf hover:bg-leaf-deep text-soil font-semibold text-[15px] px-6 py-2.5 rounded-full transition-colors whitespace-nowrap"
                >
                  Start Buying
                </Link>
                <Link
                  href="/farmers"
                  className="inline-flex items-center justify-center border border-grain/70 text-grain hover:bg-white/10 font-semibold text-[15px] px-6 py-2.5 rounded-full transition-colors whitespace-nowrap"
                >
                  Become a Supplier
                </Link>
              </div>
            </div>

            {/* Rendered once — sits right after the video on mobile (no headline
                above it there), and below the overlaid headline on desktop */}
            <div className="pb-6 sm:pb-8">
              <WeeklyBoard />
            </div>
          </div>
        </section>

        {/* ── Why WEN Foods ── */}
        <section className="bg-mint py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <p className="inline-block bg-leaf text-navy text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 mb-5">
              Why WEN Foods
            </p>
            <h2
              className="text-navy leading-[1.1] mb-6"
              style={{ fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              You already buy these things.
              <span className="block">We just make buying them easier.</span>
            </h2>
            <p className="text-navy/80 text-[15px] sm:text-[16px] leading-relaxed max-w-2xl">
              We work with selected suppliers, buy in volume and pass the advantage to
              businesses that buy regularly.
              <br />
              <strong className="font-bold text-navy">
                No endless searching. No calling five suppliers. No complicated marketplace.
              </strong>{' '}
              Just what&apos;s available. At a good price.
            </p>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="bg-navy py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <p className="text-grain text-[12px] sm:text-[13px] font-bold uppercase tracking-wide text-center mb-9 sm:mb-12">
              How it works
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-9 sm:gap-x-6">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step}>
                  <div className="relative aspect-square overflow-hidden rounded-lg">
                    <img
                      src={item.img}
                      alt={item.imgAlt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 left-3 font-display text-4xl sm:text-5xl font-bold text-white/70 leading-none drop-shadow"
                    >
                      {Number(item.step)}
                    </span>
                  </div>
                  <h3 className="font-display text-grain text-[18px] sm:text-xl font-bold mt-4 mb-1.5">
                    {item.title}
                  </h3>
                  <p className="text-grain/80 text-[13px] sm:text-[14px] leading-relaxed max-w-[15rem]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What's available this week ── */}
        <FeaturedProducts />

        {/* ── For restaurants & food businesses ── */}
        {/* Mobile: stacked — full-width photo on top, navy text block below, all
            three body lines visible. Desktop (sm and up): unchanged, navy text on
            the left and photo on the right, side by side, per the mockup. */}
        <section className="bg-navy">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="order-2 sm:order-1 flex items-center px-5 py-8 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
              <div className="max-w-md">
                <h2
                  className="text-grain leading-[1.1] mb-3 sm:mb-5"
                  style={{ fontSize: 'clamp(24px, 4.2vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em' }}
                >
                  For restaurants &amp; food businesses
                </h2>
                <div className="space-y-1.5 text-grain/90 text-[14px] sm:text-[15px] leading-relaxed mb-7">
                  <p>Your kitchen has enough to worry about.</p>
                  <p>Let WEN Foods handle it: chicken, eggs. More staples on the way.</p>
                  <p>If you regularly buy them, you&apos;re exactly who we&apos;re building for.</p>
                </div>
                <Link
                  href="/store"
                  className="inline-flex items-center justify-center bg-leaf hover:bg-leaf-deep text-navy font-semibold text-[14px] px-6 py-2.5 rounded-full transition-colors whitespace-nowrap"
                >
                  Get Started
                </Link>
              </div>
            </div>
            <div className="order-1 sm:order-2 relative min-h-[240px] sm:min-h-[340px] lg:min-h-full">
              <img
                src="/landing/restaurants-kitchen.jpg"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ── Suppliers ── */}
        {/* Mint background, navy text, left-aligned, stacked — matching the mockup's
            "For suppliers" block, not a dark market-board panel. */}
        <section className="bg-mint py-14 sm:py-20">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <h2
              className="text-navy leading-[1.1] mb-4"
              style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              For suppliers
            </h2>
            <p className="text-navy/80 text-[15px] sm:text-[16px] leading-relaxed max-w-2xl mb-6">
              <strong className="font-bold text-navy">We bring the demand. You bring the supply.</strong>{' '}
              WEN works with selected suppliers who can consistently provide the products we list.
              <br />
              We&apos;re not looking for everything — just reliable supply for what we sell.
            </p>
            <Link
              href="/farmers"
              className="inline-flex items-center justify-center bg-leaf hover:bg-leaf-deep text-navy font-semibold text-[14px] px-6 py-2.5 rounded-full transition-colors"
            >
              Become a WEN Supplier
            </Link>
          </div>
        </section>

        {/* ── FAQ ── */}
        <FAQSection />

        {/* ── Close ── */}
        <section className="bg-grain py-14 sm:py-16 border-t border-soil/8">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
            <Logo height={44} href={null} className="mb-3" />
            <p className="text-soil/70 text-[16px] mb-1">Start small. Buy better.</p>
            <p className="text-soil font-semibold text-[15px] mb-2">
              Chicken. Eggs.
            </p>
            <p className="text-stone/50 text-[14px] mb-8">That&apos;s WEN.</p>
            <Link
              href="/store"
              className="inline-flex items-center gap-2 bg-pepper hover:bg-pepper-deep text-white font-semibold text-[15px] px-8 py-3.5 rounded-full transition-colors"
            >
              Order from WEN
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
