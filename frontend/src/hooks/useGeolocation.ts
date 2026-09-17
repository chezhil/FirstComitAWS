import { useEffect, useState } from 'react'
import { CAMPUS_DEFAULT_LOCATION } from '../config'
import type { UserLocation } from '../types'

type Status = 'locating' | 'granted' | 'fallback'

export function useGeolocation() {
  const [location, setLocation] = useState<UserLocation>(CAMPUS_DEFAULT_LOCATION)
  const [status, setStatus] = useState<Status>('locating')

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('fallback')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setStatus('granted')
      },
      () => {
        setLocation(CAMPUS_DEFAULT_LOCATION)
        setStatus('fallback')
      },
      { timeout: 8000 },
    )
  }, [])

  return { location, status }
}
