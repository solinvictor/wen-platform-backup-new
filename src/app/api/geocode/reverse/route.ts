import { NextRequest, NextResponse } from 'next/server'

interface GeoapifyProperties {
  formatted?: string
  street?: string
  suburb?: string
  neighbourhood?: string
  city?: string
  county?: string
  state?: string
  country?: string
}

interface GeoapifyFeature {
  properties?: GeoapifyProperties
}

interface GeoapifyResponse {
  features?: GeoapifyFeature[]
}

export async function GET(req: NextRequest) {
  try {
    const lat = req.nextUrl.searchParams.get('lat')
    const lng = req.nextUrl.searchParams.get('lng')

    const latNum = lat != null ? parseFloat(lat) : NaN
    const lngNum = lng != null ? parseFloat(lng) : NaN
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return NextResponse.json({ error: 'Valid lat and lng are required.' }, { status: 400 })
    }

    const key = process.env.GEOAPIFY_API_KEY
    if (!key) {
      console.error('[geocode/reverse] GEOAPIFY_API_KEY is not set')
      return NextResponse.json({ error: 'Address lookup is unavailable.' }, { status: 500 })
    }

    const url = new URL('https://api.geoapify.com/v1/geocode/reverse')
    url.searchParams.set('lat', String(latNum))
    url.searchParams.set('lon', String(lngNum))
    url.searchParams.set('lang', 'en')
    url.searchParams.set('apiKey', key)

    const response = await fetch(url)
    if (!response.ok) {
      console.error('[geocode/reverse] Geoapify request failed:', response.status)
      return NextResponse.json({ error: 'Address lookup failed.' }, { status: 502 })
    }

    const data = await response.json() as GeoapifyResponse
    const props = data.features?.[0]?.properties

    const parts = [
      props?.street || props?.suburb || props?.neighbourhood,
      props?.city || props?.county,
      props?.state,
    ].filter((part): part is string => !!part?.trim())

    const label = parts.length
      ? parts.slice(0, 3).join(', ')
      : props?.formatted?.split(',').slice(0, 4).join(', ').trim() || null

    return NextResponse.json({ label })
  } catch (err) {
    console.error('[geocode/reverse] unexpected error:', err)
    return NextResponse.json({ error: 'Address lookup failed.' }, { status: 500 })
  }
}
