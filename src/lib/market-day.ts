export const MARKET_DAY_TIME_ZONE = 'Africa/Lagos'

const MARKET_DAY_WEEKDAYS = new Set(['Wednesday', 'Saturday'])

export interface MarketDayInfo {
  /** True if TODAY happens to be Wednesday or Saturday — marketing/banner use only. */
  isMarketDay: boolean
  weekday: string
  /** The weekday of the NEXT scheduled market-day delivery (always Wednesday or Saturday). */
  nextMarketDayWeekday: 'Wednesday' | 'Saturday'
  /** ISO date (YYYY-MM-DD) of that delivery. */
  nextMarketDayDate: string
}

function getDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_DAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  return Object.fromEntries(parts.map(({ type, value }) => [type, value])) as {
    year: string
    month: string
    day: string
  }
}

function addDays(date: Date, days: number) {
  const parts = getDateParts(date)
  const shifted = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + days,
  ))

  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: new Intl.DateTimeFormat('en-NG', {
      timeZone: MARKET_DAY_TIME_ZONE,
      weekday: 'long',
    }).format(shifted),
  }
}

/**
 * Market Day is a DELIVERY schedule, not an order-day restriction — orders
 * can be placed any day of the week. This always looks strictly forward
 * (never "today", even if today is Wednesday/Saturday) so there's always at
 * least one day between the order and the delivery run, same lead time the
 * old order-day-gated flow assumed.
 */
export function getMarketDayInfo(now = new Date()): MarketDayInfo {
  const weekday = new Intl.DateTimeFormat('en-NG', {
    timeZone: MARKET_DAY_TIME_ZONE,
    weekday: 'long',
  }).format(now)
  const isMarketDay = MARKET_DAY_WEEKDAYS.has(weekday)

  // Walk forward day-by-day (never "today") until we land on a market weekday.
  let offset = 1
  let candidate = addDays(now, offset)
  while (!MARKET_DAY_WEEKDAYS.has(candidate.weekday)) {
    offset += 1
    candidate = addDays(now, offset)
  }

  return {
    isMarketDay,
    weekday,
    nextMarketDayWeekday: candidate.weekday as 'Wednesday' | 'Saturday',
    nextMarketDayDate: candidate.date,
  }
}
