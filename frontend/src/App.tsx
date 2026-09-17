import { useCallback, useEffect, useRef, useState } from 'react'
import { parseQuery, searchListings } from './api'
import { USE_MOCKS } from './config'
import { useGeolocation } from './hooks/useGeolocation'
import { SearchBar } from './components/SearchBar'
import { FilterChips } from './components/FilterChips'
import { LocationBar } from './components/LocationBar'
import { LocationAsk } from './components/LocationAsk'
import { ResultsList } from './components/ResultsList'
import { LoadingState } from './components/LoadingState'
import { MapView } from './components/MapView'
import type { SelectionOrigin } from './components/MapView'
import type { ListingResult, SearchFilters, UserLocation } from './types'

type MobileTab = 'list' | 'map'

function App() {
  const {
    location,
    source,
    error: geoError,
    showAsk,
    dismissAsk,
    setManualLocation,
    requestGeolocation,
  } = useGeolocation()

  const [filters, setFilters] = useState<SearchFilters | null>(null)
  const [results, setResults] = useState<ListingResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Whether the current selection came from a click or from auto-picking
  // the top result -- the map only chases the former.
  const [selectionFrom, setSelectionFrom] = useState<SelectionOrigin>('auto')

  const selectListing = useCallback((id: string) => {
    setSelectedId(id)
    setSelectionFrom('user')
  }, [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('list')
  const [picking, setPicking] = useState(false)
  // When a search comes back empty, probe once at a wide radius so the empty
  // state can tell the difference between 'nothing nearby' and 'we simply
  // don't have anything like that'.
  const [wideHits, setWideHits] = useState<number | null>(null)
  // Set when we had to ignore the user's keywords to find anything, so the
  // list can say so rather than silently returning something broader.
  const [relaxedFrom, setRelaxedFrom] = useState<string | null>(null)
  // Set when nothing could be confirmed open, so we showed everything instead.
  const [relaxedOpenNow, setRelaxedOpenNow] = useState(false)

  const runSearch = useCallback(async (nextFilters: SearchFilters) => {
    setLoading(true)
    setError(null)
    setRelaxedFrom(null)
    setRelaxedOpenNow(false)
    try {
      let res = await searchListings(nextFilters)

      // A miss is usually the keywords being too specific ("momos"), not the
      // category being unsupported. Drop them and show the category instead of
      // dead-ending on an empty state.
      if (res.results.length === 0 && nextFilters.keywords.length > 0 && nextFilters.category) {
        const relaxed = await searchListings({ ...nextFilters, keywords: [] })
        if (relaxed.results.length > 0) {
          setRelaxedFrom(nextFilters.keywords.join(' '))
          res = relaxed
        }
      }

      // Opening hours are unknown for most imported places, so "open now" can
      // legitimately match nothing. Rather than a dead end, show what is
      // nearby and be explicit that the hours could not be confirmed.
      if (res.results.length === 0 && nextFilters.open_now) {
        const relaxed = await searchListings({ ...nextFilters, open_now: false })
        if (relaxed.results.length > 0) {
          setRelaxedOpenNow(true)
          res = relaxed
        }
      }

      setResults(res.results)
      setSelectedId(res.results[0]?.id ?? null)
      setSelectionFrom('auto')

      if (res.results.length === 0) {
        setWideHits(null)
        try {
          const wide = await searchListings({ ...nextFilters, radius_km: 50, keywords: [] })
          setWideHits(wide.total)
        } catch {
          setWideHits(null)
        }
      } else {
        setWideHits(null)
      }
    } catch {
      setError('Could not reach the search service. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

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

  function handlePickLocation(next: UserLocation) {
    setManualLocation(next)
    setPicking(false)
  }

  // Moving the pin should re-run the last search from the new spot.
  const lastSearchedAt = useRef<UserLocation | null>(null)
  useEffect(() => {
    if (!filters) return
    const prev = lastSearchedAt.current
    if (prev && prev.lat === location.lat && prev.lon === location.lon) return
    lastSearchedAt.current = location
    const next = { ...filters, user_location: location }
    setFilters(next)
    runSearch(next)
    // filters is intentionally omitted: this fires on location change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.lat, location.lon, runSearch])

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-4 sm:p-6">
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
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      {showAsk && <LocationAsk onAllow={requestGeolocation} onDismiss={dismissAsk} />}

      <LocationBar
        location={location}
        source={source}
        error={geoError}
        picking={picking}
        onTogglePicking={() => setPicking((p) => !p)}
        onUseMyLocation={requestGeolocation}
      />

      {filters && <FilterChips filters={filters} onChange={handleFilterChange} />}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={`min-h-0 overflow-y-auto ${mobileTab === 'list' ? 'block' : 'hidden'} sm:block`}>
          {loading ? (
            <LoadingState />
          ) : hasSearched ? (
            <>
              {relaxedFrom && results.length > 0 && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Nothing matched “{relaxedFrom}” exactly — showing everything nearby in
                  this category.
                </p>
              )}
              {relaxedOpenNow && results.length > 0 && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Opening hours aren’t known for these, so we can’t confirm what’s open
                  right now — showing everything nearby instead.
                </p>
              )}
            <ResultsList
              results={results}
              selectedId={selectedId}
              onSelect={selectListing}
              filters={filters}
              userLocation={location}
              wideHits={wideHits}
              onWiden={filters ? () => handleFilterChange({ radius_km: filters.radius_km * 3 }) : undefined}
            />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
              <span className="text-3xl" aria-hidden>
                {'\u{1F4CD}'}
              </span>
              <p className="text-sm">Search for a PG, mess, tiffin, print shop, or ATM near you.</p>
              <p className="text-xs">Not where you want to look? Set the pin on the map first.</p>
            </div>
          )}
        </div>

        <div className={`min-h-80 overflow-hidden rounded-xl ${mobileTab === 'map' ? 'block' : 'hidden'} sm:block`}>
          <MapView
            userLocation={location}
            results={results}
            selectedId={selectedId}
            selectionFrom={selectionFrom}
            onSelect={selectListing}
            visible={mobileTab === 'map'}
            picking={picking}
            onPickLocation={handlePickLocation}
            radiusKm={filters?.radius_km}
          />
        </div>
      </div>
    </div>
  )
}

export default App
