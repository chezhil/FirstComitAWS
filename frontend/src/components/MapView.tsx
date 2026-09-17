import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { CATEGORY_LABELS } from '../config'
import { directionsUrl, firstPhone } from './ResultCard'
import type { ListingResult, UserLocation } from '../types'

// Vite doesn't resolve Leaflet's default marker image URLs out of the box;
// point them at a CDN so pins actually render.
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const userIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,0.3)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const selectedIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [32, 52],
  iconAnchor: [16, 52],
  popupAnchor: [1, -44],
  className: 'drop-shadow-lg',
})

export type SelectionOrigin = 'auto' | 'user'

interface Props {
  userLocation: UserLocation
  results: ListingResult[]
  selectedId: string | null
  selectionFrom?: SelectionOrigin
  onSelect: (id: string) => void
  // Whether this map is currently the visible one (it stays mounted but
  // display:none'd behind the mobile List/Map tab switcher). Leaflet can't
  // measure a hidden container, so we nudge it with invalidateSize() when
  // it becomes visible again.
  visible?: boolean
  // Click-to-place mode for choosing a search location.
  picking?: boolean
  onPickLocation?: (loc: UserLocation) => void
  radiusKm?: number
}

export function MapView({
  userLocation,
  results,
  selectedId,
  selectionFrom = 'auto',
  onSelect,
  visible = true,
  picking = false,
  onPickLocation,
  radiusKm,
}: Props) {
  return (
    <MapContainer
      center={[userLocation.lat, userLocation.lon]}
      zoom={15}
      scrollWheelZoom
      className={`h-full w-full rounded-xl ${picking ? 'cursor-crosshair' : ''}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {picking && onPickLocation && <ClickToPick onPick={onPickLocation} />}

      {radiusKm != null && (
        <Circle
          center={[userLocation.lat, userLocation.lon]}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#059669', weight: 1, fillColor: '#059669', fillOpacity: 0.06 }}
        />
      )}

      <Marker
        position={[userLocation.lat, userLocation.lon]}
        icon={userIcon}
        draggable={Boolean(onPickLocation)}
        eventHandlers={
          onPickLocation
            ? {
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng()
                  onPickLocation({ lat, lon: lng })
                },
              }
            : undefined
        }
      >
        <Popup>Searching from here{onPickLocation ? ' - drag to move' : ''}</Popup>
      </Marker>

      {results.map((r) => (
        <Marker
          key={r.id}
          position={[r.location.lat, r.location.lon]}
          icon={r.id === selectedId ? selectedIcon : defaultIcon}
          eventHandlers={{ click: () => onSelect(r.id) }}
        >
          <Popup>
            <p className="font-medium">{r.name}</p>
            <p className="text-xs text-slate-500">
              {CATEGORY_LABELS[r.category]} &middot; {r.distance_km.toFixed(1)} km
            </p>
            <div className="mt-1 flex items-center gap-2">
              <a
                href={directionsUrl(userLocation, r.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline"
              >
                Directions
              </a>
              {firstPhone(r.phone) && (
                <a href={`tel:${firstPhone(r.phone)!.dial}`} className="text-slate-600 underline">
                  Call
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      <RecenterOnSelect
        results={results}
        selectedId={selectedId}
        selectionFrom={selectionFrom}
        userLocation={userLocation}
      />
      <FitToResults results={results} userLocation={userLocation} />
      <FollowUserLocation userLocation={userLocation} />
      <InvalidateSizeOnVisible visible={visible} />
    </MapContainer>
  )
}

function FollowUserLocation({ userLocation }: { userLocation: UserLocation }) {
  const map = useMap()
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    const size = map.getSize()
    if (size.x === 0 || size.y === 0) return
    map.panTo([userLocation.lat, userLocation.lon], { duration: 0.4 })
  }, [userLocation.lat, userLocation.lon, map])

  return null
}

function ClickToPick({ onPick }: { onPick: (loc: UserLocation) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  })
  return null
}

// When a new set of results arrives, show the search origin together with
// what was found, rather than jumping to whichever listing happened to be
// auto-selected first.
function FitToResults({
  results,
  userLocation,
}: {
  results: ListingResult[]
  userLocation: UserLocation
}) {
  const map = useMap()
  const signature = results.map((r) => r.id).join(',')

  useEffect(() => {
    const size = map.getSize()
    if (size.x === 0 || size.y === 0) return

    if (results.length === 0) {
      map.panTo([userLocation.lat, userLocation.lon], { duration: 0.4 })
      return
    }

    const bounds = L.latLngBounds([[userLocation.lat, userLocation.lon]])
    for (const r of results) bounds.extend([r.location.lat, r.location.lon])
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true })
    // userLocation is deliberately excluded: FollowUserLocation owns pin moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map])

  return null
}

function InvalidateSizeOnVisible({ visible }: { visible: boolean }) {
  const map = useMap()

  // Always remeasure once after mount (covers desktop, where the map is
  // shown via a `sm:` media query regardless of the mobile tab state).
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remeasure again whenever the mobile tab switches the map into view.
  useEffect(() => {
    if (!visible) return
    const id = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [visible, map])

  return null
}

function RecenterOnSelect({
  results,
  selectedId,
  selectionFrom,
  userLocation,
}: {
  results: ListingResult[]
  selectedId: string | null
  selectionFrom: SelectionOrigin
  userLocation: UserLocation
}) {
  const map = useMap()
  const isFirstRun = useRef(true)

  useEffect(() => {
    // The map is already centered on mount via MapContainer's `center` prop,
    // so there's nothing to animate to yet on the first run.
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    // Only chase a listing the user actually picked. Auto-selecting the first
    // result used to fly the map away from the search pin on every search.
    if (selectionFrom !== 'user') return
    // Leaflet's flyTo() computes NaN if called before the container has a
    // real, laid-out size (e.g. React 18 StrictMode double-invoking this
    // effect before the browser's first paint) — skip the animated pan in
    // that case rather than crashing; invalidateSize() + a later selection
    // will trigger a correctly-sized recenter anyway.
    const size = map.getSize()
    if (size.x === 0 || size.y === 0) return

    const target = results.find((r) => r.id === selectedId)
    const center = target ? target.location : userLocation
    map.flyTo([center.lat, center.lon], target ? 16 : 15, { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return null
}
