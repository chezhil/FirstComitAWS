export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <span className="text-2xl" aria-hidden>
        {'\u{1F937}'}
      </span>
      <p className="text-sm font-medium text-slate-700">No results within range</p>
      <p className="text-xs text-slate-500">Try widening the radius, clearing a filter, or rephrasing your search.</p>
    </div>
  )
}
