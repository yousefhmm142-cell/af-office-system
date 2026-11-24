import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'

/** Fetch once, with loading and error states, and a reload() after changes. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await api<T>(path))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'صار خطأ.')
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { void reload() }, [reload])
  return { data, error, loading, reload, setData }
}
