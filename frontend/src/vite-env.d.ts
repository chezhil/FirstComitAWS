/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_USE_MOCKS?: string
  readonly VITE_CAMPUS_DEFAULT_LAT?: string
  readonly VITE_CAMPUS_DEFAULT_LON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
