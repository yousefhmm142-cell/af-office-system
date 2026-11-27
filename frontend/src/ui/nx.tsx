import type { ReactNode } from 'react'

/** Soft colour families used by the new pages: a tinted background with a deep text colour. */
export type Hue = 'rose' | 'mint' | 'amber' | 'sky' | 'violet' | 'slate'
const HUES: Hue[] = ['rose', 'sky', 'mint', 'violet', 'amber']

/** The same person always gets the same soft colour. */
export function hueOf(name: string): Hue {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]!
}

// «النصيرات» → «ن», not «ا»: skip the article when taking the first letter.
const first = (w: string) => (w.startsWith('ال') && w.length > 3 ? w[2] : w[0]) ?? ''
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/)
  return first(parts[0] ?? '') + (parts.length > 1 ? first(parts[1]!) : '')
}

export function NxAvatar({ name, size = 40, hue }: { name: string; size?: number; hue?: Hue }) {
  return (
    <span className="nx-avatar" data-hue={hue ?? hueOf(name)} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function NxStat({ icon, label, value, unit, sub, hue = 'rose' }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; hue?: Hue }) {
  return (
    <div className="nx-stat" data-hue={hue}>
      <span className="nx-stat-ico">{icon}</span>
      <span className="nx-stat-label">{label}</span>
      <strong className="nx-stat-value num">{value}{unit && <small>{unit}</small>}</strong>
      {sub && <span className="nx-stat-sub">{sub}</span>}
    </div>
  )
}

/** A ring split into coloured parts, with a figure in the middle. */
export function NxDonut({ parts, center, caption, size = 150 }: { parts: Array<{ value: number; hue: Hue }>; center: ReactNode; caption?: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r
  const total = parts.reduce((s, p) => s + p.value, 0)
  let offset = 0
  return (
    <div className="nx-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="nx-donut-track" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p, i) => {
          const len = (p.value / total) * c
          const el = <circle key={i} cx="50" cy="50" r={r} className="nx-donut-part" data-hue={p.hue}
            strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} />
          offset += len
          return el
        })}
      </svg>
      <span className="nx-donut-center"><b className="num">{center}</b>{caption && <small>{caption}</small>}</span>
    </div>
  )
}

export function NxTabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ key: T; label: string; icon?: ReactNode; count?: number }>; value: T; onChange(v: T): void; label: string }) {
  return (
    <nav className="nx-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.icon}{t.label}{t.count ? <span className="nx-tab-count num">{t.count}</span> : null}
        </button>
      ))}
    </nav>
  )
}

export function NxCard({ title, icon, action, children, className = '' }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`nx-card ${className}`}>
      {(title || action) && <header className="nx-card-head">
        {title && <h3>{icon && <span className="nx-card-ico">{icon}</span>}{title}</h3>}
        {action}
      </header>}
      {children}
    </section>
  )
}

export function NxEmpty({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="nx-empty">
      <span className="nx-empty-ico">{icon}</span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {children}
    </div>
  )
}
