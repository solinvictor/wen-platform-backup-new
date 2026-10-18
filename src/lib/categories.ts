import { Egg, Fish, Wheat, Sprout, Drumstick, type LucideIcon } from 'lucide-react'

export interface CategoryMeta {
  slug: string
  label: string
  Icon: LucideIcon
  tint: string // className applied to the icon circle — see globals.css .tint-*
  blurb: string
  /** Live/orderable right now. Set to true to bring a category back — nothing
   *  else needs to change, every category-driven section reads from
   *  ACTIVE_CATEGORY_META. */
  active: boolean
}

export const CATEGORY_META: CategoryMeta[] = [
  { slug: 'chicken', label: 'Chicken', Icon: Drumstick, tint: 'tint-chicken', blurb: 'Reliable supply for your kitchen.',            active: true },
  { slug: 'eggs',    label: 'Eggs',    Icon: Egg,       tint: 'tint-eggs',    blurb: 'Fresh eggs at competitive prices.',            active: true },
  { slug: 'fish',    label: 'Fish',    Icon: Fish,      tint: 'tint-fish',    blurb: 'Selected fish from our supply network.',       active: false },
  { slug: 'rice',    label: 'Rice',    Icon: Wheat,     tint: 'tint-rice',    blurb: 'Bulk rice for businesses that buy regularly.', active: false },
  { slug: 'beans',   label: 'Beans',   Icon: Sprout,    tint: 'tint-beans',   blurb: 'Quality beans at a better buying price.',      active: false },
]

export const ACTIVE_CATEGORY_META = CATEGORY_META.filter((c) => c.active)

export function categoryMeta(slug: string): CategoryMeta | undefined {
  return CATEGORY_META.find((c) => c.slug === slug)
}
