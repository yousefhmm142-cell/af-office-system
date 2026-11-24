import { ChevronRight, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Avatar, Logo } from '../ui/primitives'
import { ThemeToggle } from '../ui/ThemeToggle'
import { OfflineBar, UpdateBar } from '../ui/NetBars'
import { useConfirm } from '../ui/Confirm'
import { useAuth, useUser } from './auth'
import { navFor } from './nav'

const MINI_KEY = 'af-sidebar-mini'

function readMini() {
  try {
    return localStorage.getItem(MINI_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const user = useUser()
  const { signOut } = useAuth()
  const confirm = useConfirm()
  const items = navFor(user)
  const { pathname } = useLocation()
  const [mini, setMini] = useState(readMini)
  const toggleMini = () => setMini((m) => {
    try { localStorage.setItem(MINI_KEY, m ? '0' : '1') } catch { /* this visit only */ }
    return !m
  })
  const tabs = items.slice(0, 5)

  const link = ({ to, label, icon: Icon }: (typeof items)[number]) => (
    <NavLink key={to} to={to} end={to === '/'} className="sb-item" data-tip={label} aria-label={mini ? label : undefined}>
      <Icon size={21} aria-hidden="true" />
      <span className="sb-t">{label}</span>
    </NavLink>
  )

  return (
    <div className={`shell${mini ? ' mini' : ''}`}>
      <a href="#main" className="skip">تخطَّ إلى المحتوى</a>
      <div className="scene" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><i className="grain" /></div>

      <aside className="sb glass" aria-label="القائمة">
        <button type="button" className="sb-collapse" onClick={toggleMini} aria-label={mini ? 'توسيع القائمة' : 'تصغير القائمة'}>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        <NavLink to="/" className="sb-top" aria-label="الرئيسية">
          <Logo height={mini ? 32 : 64} className="sb-logo" />
          <span className="sb-name">
            <span className="sb-kicker">نظام إدارة</span>
            <span className="sb-title">المكاتب</span>
            <span className="sb-company">شركة أبناء فارس أبو زايد</span>
          </span>
        </NavLink>
        <div className="sb-scroll">
          <div className="sb-label">الإدارة</div>
          <nav className="sb-nav" aria-label="الإدارة">{items.filter((i) => i.to !== '/account').map(link)}</nav>
        </div>
        <div className="sb-foot">
          <nav className="sb-nav" aria-label="الحساب">{link({ to: '/account', label: 'حسابي', icon: items[items.length - 1]!.icon })}</nav>
        </div>
      </aside>

      <div className="shell-main">
        <div className="topbar-row">
          <header className="topbar glass">
            <Link to="/" className="app-brand" aria-label="الرئيسية">
              <Logo height={34} />
              <span className="app-brand-text">
                <b>{user.branch?.name ?? 'الإدارة العامة'}</b>
                <small>أبناء فارس أبو زايد</small>
              </span>
            </Link>
            <span className="grow" />
            <div className="topbar-end">
              <ThemeToggle />
              <button
                type="button"
                className="icon-btn"
                aria-label="تسجيل الخروج"
                title="تسجيل الخروج"
                onClick={async () => { if (await confirm({ title: 'تسجيل الخروج؟', confirmLabel: 'خروج' })) await signOut() }}
              >
                <LogOut size={18} />
              </button>
              <NavLink to="/account" className="me" aria-label={`حسابي: ${user.name}`}>
                <span className="me-avatar"><Avatar name={user.name} /></span>
                <span className="me-text">
                  <b>{user.name}</b>
                  <small>{user.role?.name}{user.branch ? ` · ${user.branch.name}` : ''}</small>
                </span>
              </NavLink>
            </div>
          </header>
        </div>
        <OfflineBar />
        <UpdateBar />
        <main className="page stage glass" id="main">
          <div key={pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>

      {tabs.length > 1 && (
        <nav className="tabbar glass" aria-label="الأقسام">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="tab">
              <span className="tab-icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
