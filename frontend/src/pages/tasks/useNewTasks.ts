import { useEffect, useState } from 'react'
import { api } from '../../api/client'

/** How many tasks were sent to me and not opened yet (the badge on «مهامي»). */
export function useNewTasks(enabled: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const tick = () => { if (navigator.onLine && document.visibilityState === 'visible') void api<{ new: number }>('/tasks/mine').then((r) => setN(r.new)).catch(() => undefined) }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [enabled])
  return n
}
