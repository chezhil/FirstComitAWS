import { CATEGORY_LABELS } from '../config'
import type { Category, SortBy, SearchFilters } from '../types'

const CATEGORIES: Category[] = [
  'pg', 'mess', 'tiffin', 'food', 'bar', 'grocery', 'print_shop', 'atm',
  'pharmacy', 'medical', 'gym', 'salon', 'laundry', 'transport', 'other',
]
const SORTS: { value: SortBy; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'rating', label: 'Top rated' },
]

interface Props {
  filters: SearchFilters | null
  onChange: (patch: Partial<SearchFilters>) => void
}

export function FilterChips({ filters, onChange }: Props) {
  if (!filters) return null

  return (
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
      <ChipGroup label="Category">
        <Chip active={filters.category === null} onClick={() => onChange({ category: null })}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={filters.category === c} onClick={() => onChange({ category: c })}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup label="Sort">
        {SORTS.map((s) => (
          <Chip key={s.label} active={filters.sort_by === s.value} onClick={() => onChange({ sort_by: s.value })}>
            {s.label}
          </Chip>
        ))}
      </ChipGroup>

      <Chip active={filters.open_now} onClick={() => onChange({ open_now: !filters.open_now })}>
        {'\u{1F550} Open now'}
      </Chip>
    </div>
  )
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {/* 15 categories overflow a wrapped row, so scroll them sideways
          instead of letting the filters dominate the page. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
      }`}
    >
      {children}
    </button>
  )
}
