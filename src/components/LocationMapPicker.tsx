'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, MapPin, Navigation, X, LocateFixed } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

interface Props {
  onConfirm: (coords: { lat: number; lng: number }, label: string) => void
  onClose: () => void
  initialLocation?: { lat: number; lng: number; label: string }
}

/** Max GPS accuracy (meters) we accept without requiring a manual pin adjust */
const GOOD_ACCURACY_M = 30
/** Soft threshold — warn but still allow confirm if user explicitly adjusted pin */
const FAIR_ACCURACY_M = 75

export default function LocationMapPicker({ onConfirm, onClose, initialLocation }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null)
  const mapObj     = useRef<any>(null)
  const markerObj  = useRef<any>(null)
  const circleObj  = useRef<any>(null)
  const LRef       = useRef<any>(null)
  const watchId    = useRef<number | null>(null)
  /** True once user dragged or tapped the map — pin is intentional, not raw GPS */
  const manualPin  = useRef(false)
  /** Best (lowest) accuracy seen this session — ignore worse GPS samples */
  const bestAccuracy = useRef<number | null>(null)

  const [loading,   setLoading]   = useState(true)
  const [gpsError,  setGpsError]  = useState('')
  const [coords,    setCoords]    = useState<{ lat: number; lng: number } | null>(null)
  const [label,     setLabel]     = useState('')
  const [resolving, setResolving] = useState(false)
  const [accuracy,  setAccuracy]  = useState<number | null>(null)
  const [pinSource, setPinSource] = useState<'gps' | 'manual' | 'address' | null>(null)

  const DEFAULT = { lat: 7.7322, lng: 8.5391 }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error(`geocode/reverse ${res.status}`)
      const data = await res.json() as { label?: string | null }
      if (data.label) return data.label
    } catch { /* fall through */ }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }

  function updateAccuracyCircle(lat: number, lng: number, acc: number | null) {
    const L = LRef.current
    const map = mapObj.current
    if (!L || !map) return

    if (circleObj.current) {
      map.removeLayer(circleObj.current)
      circleObj.current = null
    }
    // Only show circle for live GPS fixes, not manual pins
    if (acc != null && acc > 0 && !manualPin.current) {
      circleObj.current = L.circle([lat, lng], {
        radius: acc,
        color: acc <= GOOD_ACCURACY_M ? '#16a34a' : acc <= FAIR_ACCURACY_M ? '#d97706' : '#ea580c',
        fillColor: acc <= GOOD_ACCURACY_M ? '#22c55e' : acc <= FAIR_ACCURACY_M ? '#f59e0b' : '#f97316',
        fillOpacity: 0.15,
        weight: 1.5,
      }).addTo(map)
    }
  }

  function movePin(lat: number, lng: number, zoom?: number, fromManual = false, suppliedLabel?: string) {
    const L   = LRef.current
    const map = mapObj.current
    if (!L || !map) return

    if (fromManual) {
      manualPin.current = true
      setPinSource('manual')
      setAccuracy(null)
      if (circleObj.current) {
        map.removeLayer(circleObj.current)
        circleObj.current = null
      }
      // Stop refining GPS so it doesn't yank the pin back
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
    }

    if (markerObj.current) {
      markerObj.current.setLatLng([lat, lng])
    } else {
      const m = L.marker([lat, lng], { draggable: true }).addTo(map)
      m.on('dragend', () => {
        const p = m.getLatLng()
        movePin(p.lat, p.lng, undefined, true)
      })
      markerObj.current = m
    }

    map.setView([lat, lng], zoom ?? map.getZoom())
    if (suppliedLabel) {
      setCoords({ lat, lng })
      setLabel(suppliedLabel)
      setResolving(false)
    } else {
      resolvePin(lat, lng)
    }
  }

  function resolvePin(lat: number, lng: number) {
    setCoords({ lat, lng })
    setResolving(true)
    reverseGeocode(lat, lng).then(l => {
      setLabel(l)
      setResolving(false)
    })
  }

  const onGPSSuccess = useCallback((pos: GeolocationPosition) => {
    // Ignore further GPS updates after user placed the pin manually
    if (manualPin.current) return

    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords
    // Skip worse fixes than what we already have (cell tower → GPS chip)
    if (bestAccuracy.current !== null && acc > bestAccuracy.current * 1.05) {
      return
    }
    bestAccuracy.current = acc

    const rounded = Math.round(acc)
    const zoom = acc <= 15 ? 19 : acc <= 30 ? 18 : acc <= 80 ? 17 : acc <= 200 ? 16 : 15

    movePin(lat, lng, zoom, false)
    setAccuracy(rounded)
    setPinSource('gps')
    setGpsError('')
    setLoading(false)
    updateAccuracyCircle(lat, lng, acc)

    // Lock once we have a strong fix
    if (acc <= GOOD_ACCURACY_M && watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onGPSError(err?: GeolocationPositionError) {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    let msg = 'Could not find you — drag the pin to your exact gate or door'
    if (err?.code === 1) msg = 'Location permission denied — allow access, or drag the pin yourself'
    else if (err?.code === 2) msg = 'GPS signal weak — go near a window, or drag the pin on the map'
    else if (err?.code === 3) msg = 'GPS timed out — drag the pin to your exact location'
    setGpsError(msg)
    // Do not pretend a city default is the user's GPS — leave map for manual pin
    if (!coords) {
      movePin(DEFAULT.lat, DEFAULT.lng, 13, true)
      setPinSource('manual')
      setAccuracy(null)
      setLabel('Drag the pin to where the rider should stop')
    }
    setLoading(false)
  }

  function startWatching() {
    if (!navigator.geolocation) {
      onGPSError()
      return
    }
    manualPin.current = false
    bestAccuracy.current = null
    setPinSource(null)
    setAccuracy(null)
    setLoading(true)
    setGpsError('')
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
    }
    watchId.current = navigator.geolocation.watchPosition(
      onGPSSuccess,
      onGPSError,
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    )
  }

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return

    // A stuck "Getting a precise GPS fix" screen with no map underneath
    // reads as broken, not loading — if Leaflet itself (bundled locally,
    // not a CDN) hasn't finished initializing within a few seconds,
    // surface that instead of spinning forever.
    const stallTimeout = window.setTimeout(() => {
      if (!mapObj.current) {
        setGpsError('Map is taking longer than expected to load — check your connection.')
        setLoading(false)
      }
    }, 8000)

    import('leaflet').then(L => {
      window.clearTimeout(stallTimeout)

      // Marker icons are served from our own /public/leaflet (copied from
      // the leaflet package at build time) instead of a CDN — a blocked
      // or slow unpkg.com would otherwise leave every pin invisible.
      const DefaultIcon = L.Icon.Default as any
      delete DefaultIcon.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl:       '/leaflet/marker-icon.png',
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        shadowUrl:     '/leaflet/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, {
        center: [initialLocation?.lat ?? DEFAULT.lat, initialLocation?.lng ?? DEFAULT.lng],
        zoom: initialLocation ? 17 : 15,
        zoomControl: true,
      })

      // No {s} subdomain fan-out — OSM's tile usage policy asks clients not
      // to load-balance across subdomains, and a single stable host is
      // actually more reliable (no extra DNS lookups to warm up).
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e: any) => {
        movePin(e.latlng.lat, e.latlng.lng, undefined, true)
      })

      LRef.current   = L
      mapObj.current = map

      // The overlay can mount a tick before layout settles (lazy-loaded
      // behind Suspense) — invalidateSize() guards against Leaflet having
      // measured a zero-height container and rendering blank/grey tiles.
      requestAnimationFrame(() => mapObj.current?.invalidateSize())

      if (initialLocation) {
        setPinSource('address')
        setLoading(false)
        movePin(initialLocation.lat, initialLocation.lng, 17, false, initialLocation.label)
      } else {
        startWatching()
      }
    }).catch(() => {
      window.clearTimeout(stallTimeout)
      setGpsError('Map failed to load — check your connection and try again')
      setLoading(false)
    })

    return () => {
      window.clearTimeout(stallTimeout)
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      if (mapObj.current) {
        mapObj.current.remove()
        mapObj.current    = null
        markerObj.current = null
        circleObj.current = null
        LRef.current      = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isManual = pinSource === 'manual'
  const isAddress = pinSource === 'address'
  const isGood   = accuracy !== null && accuracy <= GOOD_ACCURACY_M
  const isFair   = accuracy !== null && accuracy > GOOD_ACCURACY_M && accuracy <= FAIR_ACCURACY_M
  const isPoor   = accuracy !== null && accuracy > FAIR_ACCURACY_M

  // Block confirm on poor GPS unless user deliberately adjusted the pin
  const canConfirm = !!coords && !resolving && !loading && (isManual || isAddress || isGood || isFair)

  let accuracyHint: string | null = null
  let accuracyColor = 'text-stone/50'
  if (isManual) {
    accuracyHint = '✓ Pin placed by you — drag to fine-tune the exact gate or door'
    accuracyColor = 'text-green-600'
  } else if (isAddress) {
    accuracyHint = 'Address match shown — drag the pin to the recipient’s exact gate or door'
    accuracyColor = 'text-amber-600'
  } else if (isGood) {
    accuracyHint = `✓ Strong GPS — ±${accuracy}m — good for the rider`
    accuracyColor = 'text-green-600'
  } else if (isFair) {
    accuracyHint = `±${accuracy}m — ok, but drag the pin to your gate if you can`
    accuracyColor = 'text-amber-600'
  } else if (isPoor) {
    accuracyHint = `±${accuracy}m — too wide for delivery. Drag the pin to your exact spot`
    accuracyColor = 'text-orange-600'
  } else if (!loading && !gpsError) {
    accuracyHint = 'Waiting for a precise GPS fix…'
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-soil/10 shrink-0">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-pepper" />
          <span className="font-body text-soil text-[16px] font-semibold">Pin exact delivery spot</span>
        </div>
        <button onClick={onClose} className="p-2 text-soil/40 hover:text-soil transition-colors" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="px-4 py-2.5 bg-pepper/5 border-b border-pepper/10 shrink-0 text-center">
        <p className="text-[12.5px] text-pepper-deep font-medium">
          {loading
            ? 'Getting a precise GPS fix — hold still…'
            : 'Drag the pin or tap the map so the rider finds your gate'}
        </p>
      </div>

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80">
            <Loader2 size={28} className="animate-spin text-pepper" />
            <p className="text-[12px] text-soil/50">Locking onto your location…</p>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Recenter on GPS */}
        {!loading && (
          <button
            type="button"
            onClick={startWatching}
            className="absolute bottom-4 right-4 z-[500] flex items-center gap-1.5 bg-white shadow-lg border border-soil/10 rounded-full px-3 py-2.5 text-[12px] font-semibold text-soil hover:bg-grain-dim transition-colors"
            title="Use my GPS again"
          >
            <LocateFixed size={15} className="text-pepper" />
            My GPS
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-soil/10 px-4 pt-3 pb-6 bg-white space-y-3">
        {gpsError && (
          <p className="text-[12px] text-amber-600 text-center">{gpsError}</p>
        )}
        {accuracyHint && (
          <div className={`text-center text-[12px] font-medium ${accuracyColor}`}>
            {accuracyHint}
          </div>
        )}
        {(label || coords) && (
          <div className="flex items-start gap-2 bg-grain-dim rounded-xl px-3 py-2.5">
            <MapPin size={13} className="text-pepper shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] text-soil leading-snug">
                {resolving ? 'Reading address…' : (label || 'Pinned location')}
              </p>
              {coords && (
                <p className="mt-1 font-mono text-[11px] text-soil/45 tabular-nums">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  {pinSource === 'gps' ? ' · from GPS' : pinSource === 'manual' ? ' · adjusted by you' : ''}
                </p>
              )}
            </div>
          </div>
        )}
        <button
          onClick={() => coords && onConfirm(coords, label)}
          disabled={!canConfirm}
          className="w-full flex items-center justify-center gap-2 bg-pepper text-white text-[15px] font-semibold py-4 rounded-2xl hover:bg-pepper-deep transition-colors disabled:opacity-50"
        >
          <Navigation size={16} />
          {isPoor && !isManual
            ? 'Improve pin accuracy first'
            : isGood || isManual
              ? 'Confirm exact location'
              : 'Confirm this location'}
        </button>
        {isPoor && !isManual && (
          <p className="text-[11px] text-center text-stone/50">
            Wide GPS circles make riders search. Drag the pin onto your gate or door.
          </p>
        )}
      </div>
    </div>
  )
}
