export type Category = 'pg' | 'mess' | 'tiffin' | 'print_shop' | 'atm' | 'other'

export type SortBy = 'cheapest' | 'nearest' | 'rating' | null

export interface UserLocation {
  lat: number
  lon: number
}

// Response shape of POST /parse
export interface ParseResponse {
  category: Category | null
  radius_km: number
  open_now: boolean
  sort_by: SortBy
  max_price: number | null
  keywords: string[]
}

// Request shape of POST /search (ParseResponse fields + user_location)
export interface SearchFilters extends ParseResponse {
  user_location: UserLocation
}

export interface ListingResult {
  id: string
  name: string
  category: Category
  distance_km: number
  price: number | null
  price_unit: string | null
  is_open_now: boolean
  address: string
  location: UserLocation
  phone: string | null
  tags: string[]
  rating: number | null
}

// Response shape of POST /search
export interface SearchResponse {
  results: ListingResult[]
  total: number
}
