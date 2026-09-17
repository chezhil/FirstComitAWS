import type { LocationSource } from '../hooks/useGeolocation'
import type { UserLocation } from '../types'

const LABELS: Record<LocationSource, string> = {
  default: 'Campus default',
  locating: 'Finding you…',
  gps: 'Your current location',
  manual: 'Pin you placed',
}

interface Props {
  location: UserLocation
  source: LocationSource
  error: string | null
  picking: boolean
  onTogglePicking: () => void
  onUseMyLocation: () => void
}

export function LocationBar({
  location,
  source,
  error,
  picking,
  onTogglePicking,
  onUseMyLocation,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span aria-hidden>{'\u{1F4CD}'}</span>
          <span className="font-medium text-slate-800">{LABELS[source]}</span>
          <span className="text-xs text-slate-400">
            {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
          </span>
        </span>

        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onTogglePicking}
            aria-pressed={picking}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              picking
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            {picking ? 'Click the map…' : 'Set on map'}
          </button>
          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={source === 'locating'}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
          >
            {source === 'locating' ? 'Locating…' : 'Use my location'}
          </button>
        </div>
      </div>

      {picking && (
        <p className="text-xs text-emerald-700">
          Click anywhere on the map to search around that point, or drag the blue dot.
        </p>
      )}
      {error && !picking && <p className="text-xs text-amber-600">{error}</p>}
    </div>
  )
}
