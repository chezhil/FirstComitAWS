import { CATEGORY_LABELS } from '../config'
import type { ListingResult, UserLocation } from '../types'

interface Props {
  listing: ListingResult
  selected: boolean
  onSelect: () => void
  userLocation: UserLocation
}

// OSM phone values are not normalised: "+918022220022", "+91-80-32718989",
// and sometimes several numbers in one string separated by ; or /.
export function firstPhone(raw: string | null): { display: string; dial: string } | null {
  if (!raw) return null
  const first = raw.split(/[;,/]/)[0]?.trim()
  if (!first) return null
  const dial = first.replace(/[^\d+]/g, '')
  // A bare country code or a stray fragment is not something to offer to call.
  if (dial.replace(/\D/g, '').length < 7) return null
  return { display: first, dial }
}

export function directionsUrl(from: UserLocation, to: UserLocation) {
  // Universal Google Maps URL: opens the app on phones, the site on desktop.
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${from.lat},${from.lon}` +
    `&destination=${to.lat},${to.lon}`
  )
}

export function ResultCard({ listing, selected, onSelect, userLocation }: Props) {
  // Imported places often have no opening_hours in OSM. An empty hours list
  // means "always open" to the search code, so without this they would all
  // claim to be open right now.
  const hoursUnknown = listing.tags.includes('hours-unverified')
  const phone = firstPhone(listing.phone)

  return (
    <div
      className={`rounded-xl border transition ${
        selected
          ? 'border-emerald-400 bg-emerald-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {/* The selecting area is its own button so the links below can be real
          anchors -- an <a> nested inside a <button> is invalid and swallows
          the click. */}
      <button type="button" onClick={onSelect} className="w-full p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{listing.name}</p>
            <p className="text-xs text-slate-500">
              {CATEGORY_LABELS[listing.category]} &middot; {listing.distance_km.toFixed(1)} km
              {listing.address ? ` · ${listing.address}` : ''}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              !hoursUnknown && listing.is_open_now
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
          {listing.rating != null && (
            <span>
              {'⭐'} {listing.rating.toFixed(1)}
            </span>
          )}
          {listing.tags
            .filter((t) => t !== 'hours-unverified' && t !== 'osm' && t !== 'placeholder')
            .map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                {t}
              </span>
            ))}
        </div>
      </button>

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
        <a
          href={directionsUrl(userLocation, listing.location)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
        >
          <span aria-hidden>{'➤'}</span> Directions
        </a>

        {phone ? (
          <a
            href={`tel:${phone.dial}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            <span aria-hidden>{'☎'}</span> {phone.display}
          </a>
        ) : (
          <span className="text-xs text-slate-400">No number listed</span>
        )}
      </div>
    </div>
  )
}
