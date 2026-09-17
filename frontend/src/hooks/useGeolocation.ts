import { useCallback, useEffect, useRef, useState } from 'react'
import { CAMPUS_DEFAULT_LOCATION } from '../config'
import type { UserLocation } from '../types'

// 'default'  - nothing chosen yet, using the campus fallback
// 'locating' - waiting on the browser
// 'gps'      - real device location
// 'manual'   - the user picked a point on the map
export type LocationSource = 'default' | 'locating' | 'gps' | 'manual'

// What the browser will do if we call getCurrentPosition right now.
export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported'

const STORAGE_KEY = 'aaspaas.location'
const ASKED_KEY = 'aaspaas.locationAsked'

function readStored(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.lat === 'number' && typeof parsed?.lon === 'number') return parsed
  } catch {
    // private mode / blocked storage - fall through to the default
  }
  return null
}

function readAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

export function useGeolocation() {
  const stored = useRef(readStored()).current
  const [location, setLocation] = useState<UserLocation>(stored ?? CAMPUS_DEFAULT_LOCATION)
  const [source, setSource] = useState<LocationSource>(stored ? 'manual' : 'default')
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionState>('unknown')
  // Show our own ask before triggering the browser's, which only prompts once.
  const [showAsk, setShowAsk] = useState(false)

  const markAsked = () => {
    try {
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      // ignore
    }
  }

  const setManualLocation = useCallback((next: UserLocation) => {
    setLocation(next)
    setSource('manual')
    setError(null)
    setShowAsk(false)
    markAsked()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // not being able to remember the pin is not worth failing over
    }
  }, [])

  const requestGeolocation = useCallback(() => {
    setShowAsk(false)
    markAsked()

    if (!navigator.geolocation) {
      setPermission('unsupported')
      setError('This browser has no location support.')
      return
    }
    setSource('locating')
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setSource('gps')
        setPermission('granted')
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
      },
      (err) => {
        setSource((prev) => (prev === 'locating' ? (stored ? 'manual' : 'default') : prev))
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied')
          // Re-calling getCurrentPosition will not re-prompt once denied, so
          // point at the only thing that actually works.
          setError(
            'Location is blocked for this site. Allow it via the icon in your browser’s address bar, or just set the pin on the map.',
          )
        } else {
          setError('Could not get your location — set the pin on the map instead.')
        }
      },
      { timeout: 8000 },
    )
  }, [stored])

  const dismissAsk = useCallback(() => {
    setShowAsk(false)
    markAsked()
  }, [])

  // Decide whether to surface our own ask, without triggering the browser's.
  useEffect(() => {
    if (stored) return // they already chose a spot; don't nag

    if (!navigator.geolocation) {
      setPermission('unsupported')
      return
    }

    let cancelled = false
    const decide = (state: PermissionState) => {
      if (cancelled) return
      setPermission(state)
      if (state === 'granted') {
        requestGeolocation()
      } else if (state === 'denied') {
        // Already blocked, so there is no prompt left to trigger - say so up
        // front instead of silently sitting on the campus default.
        setError(
          'Location is blocked for this site. Allow it via the icon in your browser’s address bar, or just set the pin on the map.',
        )
      } else if (!readAsked()) {
        setShowAsk(true)
      }
    }

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((res) => {
          decide(res.state as PermissionState)
          res.onchange = () => setPermission(res.state as PermissionState)
        })
        .catch(() => decide('prompt'))
    } else {
      decide('prompt')
    }

    return () => {
      cancelled = true
    }
  }, [stored, requestGeolocation])

  return {
    location,
    source,
    error,
    permission,
    showAsk,
    dismissAsk,
    setManualLocation,
    requestGeolocation,
  }
}
