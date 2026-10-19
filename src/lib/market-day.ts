export const MARKET_DAY_TIME_ZONE = 'Africa/Lagos'

const MARKET_DAY_WEEKDAYS = new Set(['Tuesday', 'Friday'])

export interface MarketDayInfo {
  isMarketDay: boolean
  weekday: string
  marketDay: string | null
  deliveryWeekday: string | null
  deliveryDate: string | null
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

function addOneDay(date: Date) {
  const parts = getDateParts(date)
  const tomorrow = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 1,
  ))

  return {
    date: tomorrow.toISOString().slice(0, 10),
    weekday: new Intl.DateTimeFormat('en-NG', {
      timeZone: MARKET_DAY_TIME_ZONE,
      weekday: 'long',
    }).format(tomorrow),
  }
}

export function getMarketDayInfo(now = new Date()): MarketDayInfo {
  const weekday = new Intl.DateTimeFormat('en-NG', {
    timeZone: MARKET_DAY_TIME_ZONE,
    weekday: 'long',
  }).format(now)
  const isMarketDay = MARKET_DAY_WEEKDAYS.has(weekday)
  const tomorrow = isMarketDay ? addOneDay(now) : null

  return {
    isMarketDay,
    weekday,
    marketDay: isMarketDay ? weekday : null,
    deliveryWeekday: tomorrow?.weekday ?? null,
    deliveryDate: tomorrow?.date ?? null,
  }
}