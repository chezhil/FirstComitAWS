import type { ListingResult } from '../types'
import { ResultCard } from './ResultCard'
import { EmptyState } from './EmptyState'

interface Props {
  results: ListingResult[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ResultsList({ results, selectedId, onSelect }: Props) {
  if (results.length === 0) return <EmptyState />

  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => (
        <ResultCard key={r.id} listing={r} selected={r.id === selectedId} onSelect={() => onSelect(r.id)} />
      ))}
    </div>
  )
}
