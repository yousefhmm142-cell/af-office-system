import { Check, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface StepItem {
  key: string
  label: string
  icon?: LucideIcon
  done: boolean
}

export function Stepper({ items, current, onSelect, label, scroll }: {
  items: StepItem[]
  current: number
  onSelect(index: number): void
  label: string
  /** Many short steps (zones): one scrolling row instead of equal columns. */
  scroll?: boolean
}) {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (scroll) active.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [current, scroll])
  return (
    <nav className={`stepper ${scroll ? 'scroll' : ''}`} aria-label={label} style={scroll ? undefined : { gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((s, i) => {
        const Icon = s.icon
        return (
          <button
            key={s.key}
            ref={i === current ? active : undefined}
            type="button"
            className="step"
            aria-current={i === current ? 'step' : undefined}
            data-done={s.done || undefined}
            onClick={() => onSelect(i)}
          >
            <span className="step-dot">
              {s.done && i !== current ? <Check size={14} strokeWidth={3} /> : Icon ? <Icon size={15} /> : <span className="num">{i + 1}</span>}
            </span>
            <span className="step-label">{s.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
