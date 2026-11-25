import { useEffect, useState } from 'react'
const serverNow = () => new Date()

/** Current device time that refreshes every `everyMs`. */
export function useNow(everyMs = 15_000): Date {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
