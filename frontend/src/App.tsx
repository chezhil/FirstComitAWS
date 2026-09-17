import { useState } from 'react'
import { parseQuery, searchListings } from './api'
import { USE_MOCKS } from './config'
import { useGeolocation } from './hooks/useGeolocation'
import { SearchBar } from './components/SearchBar'
import { FilterChips } from './components/FilterChips'
import { ResultsList } from './components/ResultsList'
import { LoadingState } from './components/LoadingState'
import { MapView } from './components/MapView'
import type { ListingResult, SearchFilters } from './types'

type MobileTab = 'list' | 'map'

function App() {
  const { location, status: geoStatus } = useGeolocation()

  const [filters, setFilters] = useState<SearchFilters | null>(null)
  const [results, setResults] = useState<ListingResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('list')

  async function runSearch(nextFilters: SearchFilters) {
    setLoading(true)
    setError(null)
    try {
      const res = await searchListings(nextFilters)
      setResults(res.results)
      setSelectedId(res.results[0]?.id ?? null)
    } catch {
      setError('Could not reach the search service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(query: string) {
    setHasSearched(true)
    setLoading(true)
    setError(null)
    try {
      const parsed = await parseQuery(query)
      const nextFilters: SearchFilters = { ...parsed, user_location: location }
      setFilters(nextFilters)
      await runSearch(nextFilters)
    } catch {
      setError('Could not understand that query. Please try again.')
      setLoading(false)
    }
  }

  function handleFilterChange(patch: Partial<SearchFilters>) {
    if (!filters) return
    const nextFilters = { ...filters, ...patch }
    setFilters(nextFilters)
    runSearch(nextFilters)
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            Aas-Paas <span className="text-slate-400">{'—'}</span>{' '}
            <span className="font-normal text-slate-500">what&apos;s nearby, right now</span>
          </h1>
          {USE_MOCKS && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
              Mock data
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {geoStatus === 'locating'
            ? 'Finding your location…'
            : geoStatus === 'granted'
              ? 'Using your current location'
              : 'Using the campus default location'}
        </p>
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      {filters && <FilterChips filters={filters} onChange={handleFilterChange} />}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {!hasSearched ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
          <span className="text-3xl" aria-hidden>
            {'\u{1F4CD}'}
          </span>
          <p className="text-sm">Search for a PG, mess, tiffin, print shop, or ATM near you.</p>
        </div>
      ) : (
        <>
          {/* mobile tab switcher */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:hidden">
            {(['list', 'map'] as MobileTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 rounded-md py-1.5 font-medium capitalize transition ${
                  mobileTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden sm:grid-cols-2">
            <div className={`overflow-y-auto ${mobileTab === 'list' ? 'block' : 'hidden'} sm:block`}>
              {loading ? (
                <LoadingState />
              ) : (
                <ResultsList results={results} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </div>

            <div className={`min-h-80 overflow-hidden rounded-xl ${mobileTab === 'map' ? 'block' : 'hidden'} sm:block`}>
              <MapView userLocation={location} results={results} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
