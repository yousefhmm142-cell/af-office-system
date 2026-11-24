import { Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Avatar } from './primitives'

export interface Person { id: number; name: string; sub?: string | null }

/** Type a few letters, pick a person. Big rows, works with a thumb. */
export function PersonPicker({ people, value, onChange, placeholder = 'ابحث بالاسم…', label }: {
  people: Person[]; value: Person | null; onChange(p: Person | null): void; placeholder?: string; label: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const list = useMemo(() => {
    const s = q.trim()
    return (s ? people.filter((p) => p.name.includes(s)) : people).slice(0, 40)
  }, [people, q])

  if (value) {
    return (
      <div className="af-picked" aria-label={label}>
        <Avatar name={value.name} size={32} />
        <span><b>{value.name}</b>{value.sub && <small>{value.sub}</small>}</span>
        <button type="button" className="icon-btn" aria-label="تغيير" onClick={() => { onChange(null); setQ(''); setOpen(true) }}><X size={16} /></button>
      </div>
    )
  }
  return (
    <div className="af-picker" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <div className="af-search">
        <Search size={17} aria-hidden="true" />
        <input className="input" value={q} placeholder={placeholder} aria-label={label} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} />
      </div>
      {open && (
        <div className="af-picker-list" role="listbox">
          {list.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} className="af-picker-row" onClick={() => { onChange(p); setOpen(false) }}>
              <Avatar name={p.name} size={30} /><span><b>{p.name}</b>{p.sub && <small>{p.sub}</small>}</span>
            </button>
          ))}
          {list.length === 0 && <p className="eyebrow af-pad">لا توجد نتائج.</p>}
        </div>
      )}
    </div>
  )
}
