// Contract with the backend team lives in /team-prompts.txt at the repo root.
// Swap VITE_USE_MOCKS to "false" and set VITE_API_BASE_URL once /parse and
// /search are deployed (Person 1 shares the endpoint).

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export const USE_MOCKS: boolean =
  import.meta.env.VITE_USE_MOCKS === 'true' || !import.meta.env.VITE_API_BASE_URL

// TODO(person 4): replace with the campus's actual coordinates.
export const CAMPUS_DEFAULT_LOCATION = {
  lat: Number(import.meta.env.VITE_CAMPUS_DEFAULT_LAT) || 13.0846,
  lon: Number(import.meta.env.VITE_CAMPUS_DEFAULT_LON) || 77.6412,
}

export const CATEGORY_LABELS: Record<string, string> = {
  pg: 'PG',
  mess: 'Mess',
  tiffin: 'Tiffin',
  food: 'Food',
  bar: 'Bar',
  grocery: 'Grocery',
  print_shop: 'Print Shop',
  atm: 'ATM',
  pharmacy: 'Pharmacy',
  medical: 'Medical',
  gym: 'Gym',
  salon: 'Salon',
  laundry: 'Laundry',
  transport: 'Transport',
  other: 'Other',
}
