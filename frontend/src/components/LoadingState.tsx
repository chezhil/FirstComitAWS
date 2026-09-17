export function LoadingState() {
  return (
    <div className="flex flex-col gap-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  )
}
