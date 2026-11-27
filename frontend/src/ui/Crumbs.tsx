import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

/** A clear way back on the right, and where this page sits: «الرواتب › السلف». */
export function Crumbs({ trail }: { trail: Array<{ label: string; to?: string }> }) {
  const navigate = useNavigate()
  const parent = [...trail].reverse().find((t) => t.to)
  return (
    <nav className="nx-crumbs" aria-label="مسار الصفحة">
      <button type="button" className="nx-back" onClick={() => (window.history.length > 1 ? navigate(-1) : parent?.to && navigate(parent.to))}>
        <ArrowRight size={18} /> رجوع
      </button>
      <ol>
        {trail.map((t, i) => (
          <li key={i}>
            {i > 0 && <ChevronLeft size={15} aria-hidden="true" />}
            {t.to ? <Link to={t.to}>{t.label}</Link> : <span aria-current="page">{t.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
