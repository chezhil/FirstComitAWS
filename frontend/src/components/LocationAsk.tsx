interface Props {
  onAllow: () => void
  onDismiss: () => void
}

export function LocationAsk({ onAllow, onDismiss }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <span className="text-lg" aria-hidden>
        {'\u{1F4CD}'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-emerald-900">Find places near you?</p>
        <p className="text-xs text-emerald-700">
          Aas-Paas uses your location to rank results by distance. You can also just drop a pin on
          the map.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onAllow}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
        >
          Use my location
        </button>
      </div>
    </div>
  )
}
