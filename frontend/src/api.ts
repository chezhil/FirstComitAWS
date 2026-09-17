import { API_BASE_URL, USE_MOCKS } from './config'
import { mockParseQuery, mockSearchListings } from './mocks/mockApi'
import type { ParseResponse, SearchFilters, SearchResponse } from './types'

export async function parseQuery(query: string): Promise<ParseResponse> {
  if (USE_MOCKS) return mockParseQuery(query)

  const res = await fetch(`${API_BASE_URL}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`/parse failed with ${res.status}`)
  return res.json()
}

export async function searchListings(filters: SearchFilters): Promise<SearchResponse> {
  if (USE_MOCKS) return mockSearchListings(filters)

  const res = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  })
  if (!res.ok) throw new Error(`/search failed with ${res.status}`)
  return res.json()
}
