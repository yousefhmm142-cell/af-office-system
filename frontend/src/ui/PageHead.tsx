import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function PageHead({ title, eyebrow, actions }: { title: string; eyebrow?: string; actions?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <header className="home-head af-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="af-actions">{actions}</div>}
    </header>
  )
}

export function Loading() {
  return <div className="loading-block" role="status"><span className="spinner" aria-hidden="true" /> بيحمّل…</div>
}
