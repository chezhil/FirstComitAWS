import { useState } from 'react'
import type { FormEvent } from 'react'

interface Props {
  onSearch: (query: string) => void
  loading: boolean
}

const EXAMPLE_QUERIES = [
  'any tiffin service open right now that’s cheap',
  'print shop within 1km',
  'best rated PG nearby',
]

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSearch(value.trim())
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
        <span className="pl-2 text-slate-400" aria-hidden>
          {'\u{1F50D}'}
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Try: any tiffin service open right now that's cheap"
          className="flex-1 bg-transparent px-1 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-base"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setValue(q)
              onSearch(q)
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            {q}
          </button>
        ))}
      </div>
    </form>
  )
}
