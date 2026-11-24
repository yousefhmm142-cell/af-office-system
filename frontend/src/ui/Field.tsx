import { CircleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/** A labelled field with its error underneath, the same look as the old system. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error"><CircleAlert size={15} />{error}</span>}
    </div>
  )
}

export function ErrorBanner({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="banner danger" role="alert">
      <CircleAlert size={18} />
      <p>{text}</p>
    </div>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="perm-switch" data-on={on || undefined} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <i aria-hidden="true" />
    </button>
  )
}
