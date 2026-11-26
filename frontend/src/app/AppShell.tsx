import { Ellipsis, Search, Settings, UserRound } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useUnread } from '../pages/messages/lib'
import { useNewTasks } from '../pages/tasks/useNewTasks'
import { OfflineBar, UpdateBar } from '../ui/NetBars'
import { Avatar, Logo } from '../ui/primitives'
import { ThemeToggle } from '../ui/ThemeToggle'
import { can, useUser } from './auth'
import { GlobalSearch, openSearch, SearchButton } from './GlobalSearch'
import { navFor, type NavItem } from './nav'
import { ActivityButton, NotificationsBell } from './Notifications'
import { Sidebar, useSidebarMini } from './Sidebar'

const MAX_TABS = 5
const accountTab: NavItem = { to: '/account', label: 'حسابي', icon: UserRound }
const moreTab: NavItem = { to: '/more', label: 'المزيد', icon: Ellipsis }

/** The frame of every page, as in the office's old system: floating sidebar, top bar, bottom tabs on phones. */
export function AppShell() {
  const user = useUser()
  const manager = user.role?.key === 'branch_manager'
  const items = navFor(user)
  const pages = items.filter((i) => i.to !== '/account')
  // Phones: the most used pages first, up to five tabs; the rest sit behind «المزيد».
  const first = manager ? ['/', '/tasks', '/attendance', '/messages'] : []
  const ordered = [...first.flatMap((to) => pages.filter((i) => i.to === to)), ...pages.filter((i) => !first.includes(i.to))]
  const tabs = ordered.length < MAX_TABS ? [...ordered, accountTab] : [...ordered.slice(0, MAX_TABS - 1), moreTab]
  const hasSettings = items.some((i) => i.to === '/settings')
  const [mini, toggleMini] = useSidebarMini()
  const { pathname } = useLocation()
  const unread = useUnread()
  const newTasks = useNewTasks(!!user.branch && !!user.modules?.includes('tasks'))
  const badge = (to: string) => {
    const n = to === '/messages' ? unread : to === '/my-tasks' ? newTasks : 0
    return n > 0 ? <span className="sb-cnt red num" aria-label={`${n} جديدة`}>{n > 99 ? '99+' : n}</span> : null
  }

  const tabRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const nav = tabRef.current
    if (!nav) return
    const place = () => { const el = nav.querySelector<HTMLElement>('.tab.active .tab-icon'); if (el) { const a = el.getBoundingClientRect(); const b = nav.getBoundingClientRect(); setIndicator({ x: a.left - b.left, w: a.width }) } }
    place()
    const ro = new ResizeObserver(place); ro.observe(nav)
    void document.fonts?.ready.then(place)
    return () => ro.disconnect()
  }, [pathname, tabs.length])

  return (
    <div className={`shell${mini ? ' mini' : ''}`}>
      <a href="#main" className="skip">تخطَّ إلى المحتوى</a>
      <div className="scene" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><i className="grain" /></div>

      <Sidebar items={items} mini={mini} onToggle={toggleMini} badge={badge} />

      <div className="shell-main">
        <div className="topbar-row">
          <header className="topbar glass">
            {/* Phones keep the name on the left of the bar; computers have it in the sidebar. */}
            <Link to="/" className="app-brand" aria-label="الرئيسية">
              <Logo height={34} />
              <span className="app-brand-text">
                <b>{user.branch?.name ?? 'الإدارة العامة'}</b>
                <small>أبناء فارس أبو زايد</small>
              </span>
            </Link>
            <button type="button" className="top-search" onClick={openSearch} aria-label="بحث (Ctrl+K)">
              <Search size={18} aria-hidden="true" />
              <span>{can(user, 'tasks.view') || can(user, 'tasks.manage') ? 'ابحث: مهمة، مشترك، ختم، صفحة…' : 'ابحث: صفحة، موظف…'}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="grow" />
            <div className="topbar-end">
              <SearchButton className="phone-only" />
              {hasSettings && (
                <NavLink to="/settings" className="rbtn top-settings" aria-label="الإعدادات" title="الإعدادات">
                  <Settings size={19} aria-hidden="true" />
                </NavLink>
              )}
              <ThemeToggle />
              {manager && <ActivityButton />}
              <NotificationsBell withFeed={manager} />
              <NavLink to="/account" className="me" aria-label={`حسابي: ${user.name}`}>
                <span className="me-avatar"><Avatar name={user.name} /></span>
                <span className="me-text">
                  <b>{user.name}</b>
                  <small>{user.job_title || user.role?.name}</small>
                </span>
              </NavLink>
            </div>
          </header>
        </div>

        <GlobalSearch />
        <OfflineBar />
        <UpdateBar />

        <main className="page stage glass" id="main" data-section={pathname.startsWith('/seals') ? 'seals' : undefined}>
          <div key={pathname} className="page-enter"><Outlet /></div>
        </main>
      </div>

      {tabs.length > 1 && (
        <nav className="tabbar glass" aria-label="الأقسام" ref={tabRef}>
          {indicator && <span className="fx-tab-indicator" aria-hidden="true" style={{ width: indicator.w, transform: `translateX(${indicator.x}px)` }} />}
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/tasks'} className="tab">
              <span className="tab-icon"><Icon size={21} aria-hidden="true" />{badge(to)}</span>
              <span className="tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

