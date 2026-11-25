import { useMemo, useState } from 'react'
import { searchSubscribers, type Subscriber } from './subscribers'

/** A name box that suggests subscribers from the office's list as two or more parts of the name are typed. */
export function SubscriberField({ id, list, label, value, onChange, onPick, placeholder }: {
  id?: string
  list: Subscriber[]
  label: string
  value: string
  onChange(v: string): void
  onPick(s: Subscriber): void
  placeholder?: string
}) {
  const [focus, setFocus] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const matches = useMemo(() => (chosen === value ? [] : searchSubscribers(list, value)), [list, value, chosen])
  const pick = (s: Subscriber) => { setChosen(s.n); onChange(s.n); onPick(s); setFocus(false) }
  return (
    <div className="field sub-search">
      <label className="field">
        <span className="label">{label}</span>
        <input id={id} className="input" maxLength={120} value={value} autoComplete="off" placeholder={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && focus && matches[0]) { e.preventDefault(); pick(matches[0]) } }} />
      </label>
      {focus && matches.length > 0 && (
        <ul className="sub-list" role="listbox">
          {matches.map((s, k) => (
            <li key={k}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <b>{s.n}</b>
                <small>{[s.a, s.b && `طبلون ${s.b}`].filter(Boolean).join(' · ')}{s.p && <>{(s.a || s.b) && ' · '}<bdi className="num" dir="ltr">{s.p}</bdi></>}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
