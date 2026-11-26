import { BookOpen, ChevronDown, ChevronRight, Stamp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useLoad } from '../lib/useLoad'
import { Logo } from '../ui/primitives'
import { useUser } from './auth'
import type { NavItem } from './nav'

// The floating sidebar on the right (computers), as in the office's old system: the pages grouped,
// with small counters. On phones the bottom bar is used instead.

const OPERATION = ['/', '/generation', '/distribution', '/tasks', '/attendance']
const FOLLOW = ['/readings', '/seals', '/tasks/seal-work', '/reports', '/messages']
const MINE = ['/my-tasks', '/attendance/me', '/my-pay', '/me']
// For a branch manager these open from the settings (the team, the branch hours), as in the old system.
const IN_SETTINGS = ['/branches', '/users']
const SEAL_PAGES = [
  { to: '/seals', label: 'صرف الأختام' },
  { to: '/seals/recent', label: 'آخر ما صُرف' },
  { to: '/seals/unrecorded', label: 'غير المسجّلة' },
  { to: '/seals/log', label: 'تسجيل الأختام والبحث' },
]
const MINI_KEY = 'af-sidebar-mini'

type Counts = Record<string, { n: number; tone: 'amber' | 'red'; title: string }>

/** Counters next to the pages: amber = waits for the manager, red = late. */
function useCounts(enabled: boolean) {
  const res = useLoad<{ counts: Counts }>(enabled ? '/shell/counts' : null)
  const { reload } = res
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 60_000)
    return () => window.clearInterval(id)
  }, [enabled, reload])
  return res.data?.counts ?? null
}

export function useSidebarMini(): [boolean, () => void] {
  const [mini, setMini] = useState(() => { try { return localStorage.getItem(MINI_KEY) === '1' } catch { return false } })
  return [mini, () => setMini((m) => {
    try { localStorage.setItem(MINI_KEY, m ? '0' : '1') } catch { /* this visit only */ }
    return !m
  })]
}

export function Sidebar({ items, mini, onToggle, badge }: { items: NavItem[]; mini: boolean; onToggle(): void; badge(to: string): ReactNode }) {
  const user = useUser()
  const manager = user.role?.key === 'branch_manager'
  const counts = useCounts(manager)
  const { pathname } = useLocation()
  const inSeals = pathname.startsWith('/seals')
  const [sealsOpen, setSealsOpen] = useState(inSeals)
  useEffect(() => { if (inSeals) setSealsOpen(true) }, [inSeals])
  const sealsBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sealsOpen) return
    const t = window.setTimeout(() => sealsBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 420)
    return () => window.clearTimeout(t)
  }, [sealsOpen])

  const pick = (list: string[]) => list.flatMap((to) => items.filter((i) => i.to === to))
  const settings = items.filter((i) => i.to === '/settings')
  const used = new Set([...OPERATION, ...FOLLOW, ...MINE, ...IN_SETTINGS, '/settings', '/account'])
  // A branch manager gets the old office menu; everyone else one list of their pages.
  const groups: Array<{ label: string; list: NavItem[] }> = manager
    ? [
        { label: 'التشغيل', list: pick(OPERATION) },
        { label: 'المتابعة', list: [...pick(FOLLOW), ...items.filter((i) => !used.has(i.to))] },
        { label: 'لي', list: pick(MINE) },
      ]
    : [{ label: user.branch ? 'صفحاتي' : 'الإدارة', list: items.filter((i) => i.to !== '/account' && i.to !== '/settings') }]

  const count = (to: string) => {
    const c = counts?.[to]
    return c && c.n > 0 ? <span className={`sb-cnt ${c.tone} num`} title={c.title}>{c.n}</span> : badge(to)
  }
  const link = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink key={to} to={to} end={to === '/' || to === '/tasks' || to === '/seals' || to === '/attendance'} className="sb-item" data-tip={label} aria-label={mini ? label : undefined}>
      <Icon size={21} aria-hidden="true" />
      <span className="sb-t">{label}</span>
      {count(to)}
    </NavLink>
  )

  return (
    <aside className="sb glass" aria-label="القائمة">
      <button type="button" className="sb-collapse" onClick={onToggle} aria-label={mini ? 'توسيع القائمة' : 'تصغير القائمة'} title={mini ? 'توسيع القائمة' : 'تصغير القائمة'}>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <NavLink to="/" className="sb-top" aria-label="الرئيسية">
        <Logo height={mini ? 32 : 64} className="sb-logo" />
        <span className="sb-name">
          <span className="sb-kicker">نظام إدارة</span>
          <span className="sb-title">{manager && user.branch ? <BranchTitle name={user.branch.name} /> : 'المكاتب'}</span>
          <span className="sb-company">شركة أبناء فارس أبو زايد</span>
        </span>
      </NavLink>

      <div className="sb-scroll">
        {groups.filter((g) => g.list.length > 0).map((g) => (
          <div key={g.label}>
            <div className="sb-label">{g.label}</div>
            <nav className="sb-nav" aria-label={g.label}>
              {g.list.map((i) => manager && i.to === '/seals' ? (
                <div key="seals" ref={sealsBox} className={`sb-group${sealsOpen ? ' open' : ''}`}>
                  <button type="button" className={`sb-item${inSeals ? ' active' : ''}`} data-tip="الأختام" aria-expanded={sealsOpen} onClick={() => setSealsOpen((o) => !o)}>
                    <Stamp size={21} aria-hidden="true" />
                    <span className="sb-t">الأختام</span>
                    <ChevronDown size={16} className="sb-chev" aria-hidden="true" />
                  </button>
                  <div className="sb-sub">
                    {SEAL_PAGES.map((p) => <NavLink key={p.to} to={p.to} end className="sb-subitem"><span>{p.label}</span></NavLink>)}
                  </div>
                </div>
              ) : link(i))}
            </nav>
          </div>
        ))}
      </div>

      {manager && (
        <div className="sb-foot">
          <div className="sb-label">النظام</div>
          <nav className="sb-nav" aria-label="النظام">
            {settings.map(link)}
            {link({ to: '/guide', label: 'دليل الاستخدام', icon: BookOpen })}
          </nav>
        </div>
      )}
    </aside>
  )
}

/** «مخيم 2» with the number in the brand colour, like the old system; other names as they are. */
function BranchTitle({ name }: { name: string }) {
  const m = /^(.*?)(\s*\d+)$/.exec(name)
  return m ? <>{m[1]}<span className="sb-two num">{m[2]!.trim()}</span></> : <>{name}</>
}
