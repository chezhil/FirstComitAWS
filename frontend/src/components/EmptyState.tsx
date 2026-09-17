import { CATEGORY_LABELS } from '../config'
import type { SearchFilters } from '../types'

interface Props {
  filters: SearchFilters | null
  // Matches found at a much wider radius: 0 means widening cannot help,
  // so don't offer it. null means we don't know yet.
  wideHits?: number | null
  onWiden?: () => void
}

const COVERED = ['pg', 'tiffin', 'food', 'print_shop', 'atm', 'pharmacy', 'grocery']

export function EmptyState({ filters, wideHits, onWiden }: Props) {
  const nothingAnywhere = wideHits === 0
  const radius = filters?.radius_km ?? 2
  // "other" is an internal bucket, not something to say back to a person.
  const what =
    filters?.category && filters.category !== 'other'
      ? CATEGORY_LABELS[filters.category].toLowerCase()
      : null

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <span className="text-2xl" aria-hidden>
        {'\u{1F937}'}
      </span>

      {nothingAnywhere ? (
        <>
          <p className="text-sm font-medium text-slate-700">No matches for that</p>
          <p className="text-xs text-slate-500">
            Try {COVERED.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(', ')} — or pick a
            category below.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-700">
            Nothing {what ? `(${what}) ` : ''}within {radius} km
          </p>
          <p className="text-xs text-slate-500">
            {filters?.open_now
              ? 'Everything nearby may be closed right now — try turning off “Open now”.'
              : 'Try a wider radius, or move the pin closer to where you want to look.'}
          </p>
          {onWiden && wideHits !== 0 && (
            <button
              type="button"
              onClick={onWiden}
              className="mt-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              {wideHits ? `Show ${wideHits} further out` : `Search within ${Math.round(radius * 3)} km`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
