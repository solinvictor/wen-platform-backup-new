/**
 * WEN Foods — distance-based delivery pricing
 *
 * HQ: Welfare Quarters, Makurdi, Benue State
 * Rate: ₦200 per km
 * Market Day discount: 20% off the delivery fee
 */

export const WEN_HQ = { lat: 7.7290, lng: 8.5247 } // Welfare Quarters, Makurdi

export const DELIVERY_RATE_PER_KM  = 200   // ₦ per km
export const MARKET_DAY_DELIVERY_DISCOUNT_PERCENT = 20
export const MIN_DELIVERY_FEE = 300        // floor — never charge less than ₦300

// WEN currently only delivers within Makurdi, Benue State. Gboko and Otukpo
// — the next-nearest towns — are ~90-100km from HQ, so this comfortably
// covers Makurdi town and its immediate environs without reaching them.
export const SERVICE_AREA_RADIUS_KM = 25
export const SERVICE_AREA_LABEL = 'Makurdi, Benue State'

/** Whether a point is inside WEN's current delivery area. */
export function isWithinServiceArea(lat: number, lng: number): boolean {
  return haversineKm(WEN_HQ.lat, WEN_HQ.lng, lat, lng) <= SERVICE_AREA_RADIUS_KM
}

/** Haversine formula — straight-line distance in km between two lat/lng points */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) {
  return deg * (Math.PI / 180)
}

export interface DeliveryCalc {
  distanceKm: number   // rounded to 1 decimal place
  baseFee: number      // ₦, before any discount
  discount: number     // ₦, market day saving (0 on non-market days)
  finalFee: number     // ₦, what the customer pays
}

/**
 * Compute the delivery fee for a given distance and market-day state.
 * Pass isMarketDay from getMarketDayInfo().isMarketDay.
 */
export function calcDeliveryFee(
  distanceKm: number,
  isMarketDay: boolean,
): DeliveryCalc {
  const baseFee = Math.max(MIN_DELIVERY_FEE, Math.round(distanceKm * DELIVERY_RATE_PER_KM))
  const discount = isMarketDay
    ? Math.round(baseFee * (MARKET_DAY_DELIVERY_DISCOUNT_PERCENT / 100))
    : 0
  const finalFee = baseFee - discount
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    baseFee,
    discount,
    finalFee,
  }
}
