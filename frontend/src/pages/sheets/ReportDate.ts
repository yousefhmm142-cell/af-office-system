import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { isISODate } from '../../lib/dates'
import { setViewDay, useToday, useViewDay } from '../../lib/viewDay'

export function useReportDate() {
  const { date: segment } = useParams()
  const [query] = useSearchParams()
  const requested = segment ?? query.get('date') ?? undefined
  const today = useToday()
  const viewDay = useViewDay()
  const date = isISODate(requested) && requested <= today ? requested : viewDay
  useEffect(() => {
    if (isISODate(requested) && requested <= today) setViewDay(requested)
  }, [requested, today])
  return date
}
