import type { Category, ListingResult, ParseResponse, SearchFilters, SearchResponse } from '../types'
import { MOCK_LISTINGS } from './fixtures'

// Rough stand-in for the real Strands agent in backend/parser/ — just enough
// keyword matching to make the mock-mode demo feel responsive. Never used
// once VITE_USE_MOCKS=false.
const CATEGORY_WORDS: Record<Category, string[]> = {
  tiffin: ['tiffin', 'dabba'],
  mess: ['mess', 'canteen'],
  pg: ['pg', 'hostel', 'stay', 'room'],
  food: ['food', 'restaurant', 'cafe', 'eat', 'meal', 'bakery'],
  bar: ['bar', 'pub', 'beer'],
  grocery: ['grocery', 'supermarket', 'kirana'],
  print_shop: ['print', 'xerox', 'photocopy', 'printout'],
  atm: ['atm', 'cash', 'withdraw'],
  pharmacy: ['pharmacy', 'chemist', 'medicine'],
  medical: ['hospital', 'clinic', 'doctor', 'dentist'],
  gym: ['gym', 'fitness'],
  salon: ['salon', 'barber', 'haircut'],
  laundry: ['laundry', 'dhobi'],
  transport: ['bus', 'metro', 'station'],
  other: [],
}

export async function mockParseQuery(query: string): Promise<ParseResponse> {
  await delay(250)
  const q = query.toLowerCase()

  let category: Category | null = null
  for (const [cat, words] of Object.entries(CATEGORY_WORDS) as [Category, string[]][]) {
    if (words.some((w) => q.includes(w))) {
      category = cat
      break
    }
  }

  const open_now = /\b(now|right now|currently open|open now)\b/.test(q)
  const cheapest = /\b(cheap|cheapest|budget|affordable)\b/.test(q)
  const rating = /\b(best|top rated|top-rated|highly rated)\b/.test(q)

  const radiusMatch = q.match(/within\s+(\d+(?:\.\d+)?)\s*km/)
  const radius_km = radiusMatch ? Number(radiusMatch[1]) : 2

  const priceMatch = q.match(/under\s*(?:₹|rs\.?|inr)?\s*(\d+)/)
  const max_price = priceMatch ? Number(priceMatch[1]) : null

  return {
    category,
    radius_km,
    open_now,
    sort_by: cheapest ? 'cheapest' : rating ? 'rating' : null,
    max_price,
    keywords: query.split(/\s+/).filter(Boolean),
  }
}

export async function mockSearchListings(filters: SearchFilters): Promise<SearchResponse> {
  await delay(350)

  let results: ListingResult[] = MOCK_LISTINGS.filter((l) => l.distance_km <= filters.radius_km)

  if (filters.category) {
    results = results.filter((l) => l.category === filters.category)
  }
  if (filters.open_now) {
    results = results.filter((l) => l.is_open_now)
  }
  if (filters.max_price != null) {
    results = results.filter((l) => l.price == null || l.price <= filters.max_price!)
  }

  results = [...results].sort((a, b) => {
    if (filters.sort_by === 'cheapest') return (a.price ?? Infinity) - (b.price ?? Infinity)
    if (filters.sort_by === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
    return a.distance_km - b.distance_km
  })

  return { results, total: results.length }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
