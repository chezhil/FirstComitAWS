import { CATEGORY_LABELS } from '../config'
import type { ListingResult } from '../types'

interface Props {
  listing: ListingResult
  selected: boolean
  onSelect: () => void
}

export function ResultCard({ listing, selected, onSelect }: Props) {
  // Imported places often have no opening_hours in OSM. An empty hours list
  // means "always open" to the search code, so without this they would all
  // claim to be open right now.
  const hoursUnknown = listing.tags.includes('hours-unverified')

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{listing.name}</p>
          <p className="text-xs text-slate-500">
            {CATEGORY_LABELS[listing.category]} &middot; {listing.distance_km.toFixed(1)} km &middot; {listing.address}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            hoursUnknown
              ? 'bg-slate-100 text-slate-500'
              : listing.is_open_now
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          {hoursUnknown ? 'Hours unknown' : listing.is_open_now ? 'Open now' : 'Closed'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {listing.price != null && (
          <span className="font-medium text-slate-900">
            {'₹'}
            {listing.price}
            {listing.price_unit ? ` / ${listing.price_unit.replace('per_', '')}` : ''}
          </span>
        )}
        {listing.rating != null && <span>{'⭐'} {listing.rating.toFixed(1)}</span>}
        {listing.tags
          .filter((t) => t !== 'hours-unverified' && t !== 'osm' && t !== 'placeholder')
          .map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
            {t}
          </span>
        ))}
      </div>
    </button>
  )
}
