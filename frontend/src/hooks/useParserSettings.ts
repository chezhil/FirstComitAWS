import { useCallback, useState } from 'react'
import type { ParserSettings } from '../types'

const KEY = 'aaspaas.parserSettings'
const EMPTY: ParserSettings = { provider: '', model: '', apiKey: '' }

function read(): ParserSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    // blocked or private-mode storage: fall back to the server default
  }
  return EMPTY
}

export function useParserSettings() {
  const [settings, setSettings] = useState<ParserSettings>(read)

  const save = useCallback((next: ParserSettings) => {
    setSettings(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // not persisting is survivable; it still applies this session
    }
  }, [])

  return { settings, save }
}
