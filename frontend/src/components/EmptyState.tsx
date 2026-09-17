import { CATEGORY_LABELS } from '../config'
import type { SearchFilters } from '../types'

interface Props {
  filters: SearchFilters | null
  // Matches at a much wider radius: 0 means widening cannot help, so don't
  // offer it. null means we don't know yet.
  wideHits?: number | null
  onWiden?: () => void
}

const SUGGESTIONS = ['pg', 'tiffin', 'food', 'print_shop', 'atm', 'pharmacy', 'grocery']

export function EmptyState({ filters, wideHits, onWiden }: Props) {
  const radius = filters?.radius_km ?? 2
  const nothingAnywhere = wideHits === 0
  // Nothing matched these words anywhere, and the query didn't land on a
  // category either -- so it wasn't a place search we can answer at all.
  const unrecognised = nothingAnywhere && (filters?.category ?? null) === null
  // "other" is an internal bucket, not a word to say back to a person.
  const what =
    filters?.category && filters.category !== 'other'
      ? CATEGORY_LABELS[filters.category].toLowerCase()
      : null

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <span className="text-2xl" aria-hidden>
        {unrecognised ? '\u{1F9ED}' : '\u{1F937}'}
      </span>

      {unrecognised ? (
        <>
          <p className="text-sm font-medium text-slate-700">
            Not sure what you&apos;re looking for
          </p>
          <p className="max-w-xs text-xs text-slate-500">
            Try naming a place you need — a PG, tiffin service, print shop, ATM, chemist or
            somewhere to eat.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map((c) => (
              <span
                key={c}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
              >
                {CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>
        </>
      ) : nothingAnywhere ? (
        <>
          <p className="text-sm font-medium text-slate-700">
            No {what ?? 'results'} around here
          </p>
          <p className="text-xs text-slate-500">
            Nothing like that is listed near this pin — try a different category.
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
          {onWiden && (
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
