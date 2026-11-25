import { BookOpen, ChevronLeft, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { useUser } from '../app/auth'
import { navFor } from '../app/nav'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** On phones: the sections that do not fit in the bottom bar. */
export function More() {
  useDocumentTitle('المزيد')
  const employee = useUser()
  const rest = navFor(employee).filter((item) => !['/', '/tasks', '/attendance', '/messages', '/account'].includes(item.to))
  return (
    <div className="account more-page">
      <header className="ph"><div><h1>المزيد</h1><p className="muted">باقي صفحاتك وإعدادات حسابك.</p></div></header>
      <section className="card rows">
        {[...rest, { to: '/guide', label: 'دليل الاستخدام', icon: BookOpen }, { to: '/account', label: 'حسابي', icon: UserRound }].map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="row">
            <Icon size={18} />
            <span className="row-label">{label}</span>
            <ChevronLeft size={18} className="row-chevron" />
          </Link>
        ))}
      </section>
    </div>
  )
}
