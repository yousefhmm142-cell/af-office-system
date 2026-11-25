import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'

/** Fetch once, with loading and error states, and a reload() after changes. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const request = useRef(0)

  const reload = useCallback(async () => {
    if (!path) return
    const id = ++request.current
    setLoading(true)
    try {
      const result = await api<T>(path)
      if (id !== request.current) return
      setData(result)
      setError(null)
    } catch (e) {
      if (id === request.current) setError(e instanceof ApiError ? e.message : 'حدث خطأ.')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void reload()
    return () => { request.current++ }
  }, [reload])
  return { data, error, loading, reload, setData }
}
