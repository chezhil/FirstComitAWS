import type { ListingResult, SearchFilters, UserLocation } from '../types'
import { ResultCard } from './ResultCard'
import { EmptyState } from './EmptyState'

interface Props {
  results: ListingResult[]
  selectedId: string | null
  onSelect: (id: string) => void
  filters: SearchFilters | null
  userLocation: UserLocation
  wideHits?: number | null
  onWiden?: () => void
}

export function ResultsList({ results, selectedId, onSelect, filters, userLocation, wideHits, onWiden }: Props) {
  if (results.length === 0)
    return <EmptyState filters={filters} wideHits={wideHits} onWiden={onWiden} />

  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => (
        <ResultCard
          key={r.id}
          listing={r}
          selected={r.id === selectedId}
          onSelect={() => onSelect(r.id)}
          userLocation={userLocation}
        />
      ))}
    </div>
  )
}
