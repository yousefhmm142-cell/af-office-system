import type { SelectHTMLAttributes } from 'react'
import { ChoiceField } from './ChoiceField'

const label = (ym: string) => new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`))
const shift = (ym: string, by: number) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7) }
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)

/**
 * A month chosen from a list in Arabic («نوفمبر 2026»), instead of the browser's own month box
 * (which shows English on many phones). From two years back to a few months ahead.
 */
export function MonthField({ value, onChange, back = 24, ahead = 3, ...rest }: { value: string; onChange(month: string): void; back?: number; ahead?: number } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const now = thisMonth()
  const months = Array.from({ length: back + ahead + 1 }, (_, i) => shift(now, ahead - i))
  if (value && !months.includes(value)) months.push(value)
  return (
    <ChoiceField {...rest} className={`input select ${rest.className ?? ''}`} value={value} onChange={(e) => e.target.value && onChange(e.target.value)}>
      {months.map((m) => <option key={m} value={m}>{label(m)}</option>)}
    </ChoiceField>
  )
}
