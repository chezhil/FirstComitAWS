import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import { CATEGORY_LABELS } from '../config'
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

interface Props {
  userLocation: UserLocation
  results: ListingResult[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function MapView({ userLocation, results, selectedId, onSelect }: Props) {
  return (
    <MapContainer
      center={[userLocation.lat, userLocation.lon]}
      zoom={15}
      scrollWheelZoom
      className="h-full w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={[userLocation.lat, userLocation.lon]} icon={userIcon}>
        <Popup>You are here</Popup>
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
          </Popup>
        </Marker>
      ))}

      <RecenterOnSelect results={results} selectedId={selectedId} userLocation={userLocation} />
    </MapContainer>
  )
}

function RecenterOnSelect({
  results,
  selectedId,
  userLocation,
}: {
  results: ListingResult[]
  selectedId: string | null
  userLocation: UserLocation
}) {
  const map = useMap()

  useEffect(() => {
    const target = results.find((r) => r.id === selectedId)
    const center = target ? target.location : userLocation
    map.flyTo([center.lat, center.lon], target ? 16 : 15, { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return null
}
