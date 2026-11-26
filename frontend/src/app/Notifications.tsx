import { AlertTriangle, Bell, Info, Radio, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useLoad } from '../lib/useLoad'
import { useNow } from '../lib/useNow'

// Two buttons in the top bar, as in the office's old system:
// · «آخر الحركات»: the branch's latest movements, with search and a kind filter.
// · the bell: what needs attention now, and the movements not read yet («read» is kept on this device).

interface FeedEvent { id: string; kind: string; at: string; who: string; text: string; route: string; reference?: string; tone?: string | null }
interface Attention { kind: string; count: number; link: string }

const SEEN_KEY = 'af-notif-seen'
const SEEN_EVENT = 'af-notif-seen'
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? '' } catch { return '' } }

function useSeen(): [string, () => void] {
  const [seen, setSeen] = useState(readSeen)
  useEffect(() => {
    const on = () => setSeen(readSeen())
    window.addEventListener(SEEN_EVENT, on)
    return () => window.removeEventListener(SEEN_EVENT, on)
  }, [])
  return [seen, () => {
    const t = new Date().toISOString()
    try { localStorage.setItem(SEEN_KEY, t) } catch { /* this visit only */ }
    setSeen(t)
    window.dispatchEvent(new Event(SEEN_EVENT))
  }]
}

/** Loads a path now and again every minute while the page is visible. */
function usePolled<T>(path: string | null) {
  const res = useLoad<T>(path)
  const { reload } = res
  useEffect(() => {
    if (!path) return
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 60_000)
    return () => window.clearInterval(id)
  }, [path, reload])
  return res
}

export function useFeed(enabled: boolean) {
  return usePolled<{ events: FeedEvent[] }>(enabled ? '/shell/feed' : null).data?.events ?? null
}

export function ago(at: string, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000))
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} س`
  return h < 48 ? 'أمس' : `قبل ${Math.floor(h / 24)} أيام`
}

function TopPanel({ button, label, children }: { button: (open: boolean, toggle: () => void) => ReactNode; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
      else if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return (
    <div className="bell-wrap" ref={box}>
      {button(open, () => setOpen((o) => !o))}
      {open && <div className="notif" role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function FeedRows({ rows, seen, now, empty, go }: { rows: FeedEvent[]; seen: string; now: Date; empty: string; go(to?: string): void }) {
  return (
    <ul className="notif-list">
      {rows.length === 0 ? <li className="notif-empty">{empty}</li> : rows.map((e) => (
        <li key={e.id}>
          <button type="button" className={`notif-i${e.at > seen ? ' unread' : ''}`} data-tone={e.tone ?? undefined} onClick={() => go(e.route)}>
            <span className="ni" aria-hidden="true">{e.who.trim().slice(0, 1)}</span>
            <span className="nt"><b>{e.who}</b><small>{e.text}</small><em className="num">{ago(e.at, now)}</em></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** «آخر الحركات»: the word and its icon in the top bar, separate from the bell. */
export function ActivityButton() {
  const now = useNow(60_000)
  const feed = useFeed(true)
  const navigate = useNavigate()
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const q = search.trim()
  const shown = (feed ?? []).filter((e) => (!kind || e.kind === kind) && (!q || `${e.who} ${e.text} ${e.reference ?? ''}`.includes(q)))
  return (
    <TopPanel label="آخر الحركات" button={(open, toggle) => (
      <button type="button" className="top-pill" aria-expanded={open} onClick={toggle}>
        <Radio size={17} aria-hidden="true" />
        <span>آخر الحركات</span>
        <i className="top-live" data-live={feed ? true : undefined} aria-hidden="true" />
      </button>
    )}>
      {(close) => {
        const go = (to?: string) => { close(); if (to) navigate(to) }
        return (
          <>
            <div className="notif-h">
              <b>آخر الحركات</b>
              <span className="grow" />
              <small className="notif-live" data-live={feed ? true : undefined}><i />تتحدّث كل دقيقة</small>
            </div>
            <div className="notif-tools">
              <label className="notif-search">
                <Search size={15} aria-hidden="true" />
                <input aria-label="بحث في الحركات" placeholder="ابحث عن شخص أو رقم مهمة…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <select className="select" aria-label="نوع الحركة" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">كل الحركات</option>
                <option value="task">المهام</option>
                <option value="attendance">الحضور</option>
                <option value="report">التوليد</option>
                <option value="sheet">التوزيع</option>
              </select>
            </div>
            <FeedRows rows={shown} seen="~" now={now} go={go} empty={!feed ? 'جارٍ التحميل…' : q || kind ? 'لا توجد حركات تطابق البحث.' : 'لا توجد حركات في آخر يومين.'} />
            <p className="notif-foot num">{shown.length} حركة في آخر يومين</p>
          </>
        )
      }}
    </TopPanel>
  )
}

const ATTENTION: Record<string, { title: (n: number) => string; tone: 'warn' | 'info' }> = {
  payroll_draft: { title: (n) => `${n} دفعة رواتب بانتظار الاعتماد`, tone: 'warn' },
  payroll_to_pay: { title: (n) => `${n} دفعة رواتب جاهزة للصرف`, tone: 'info' },
  attendance_pending: { title: (n) => `${n} يوم حضور بانتظار الاعتماد`, tone: 'warn' },
  tasks_late: { title: (n) => `${n} مهمة تجاوزت وقتها`, tone: 'warn' },
  messages: { title: (n) => `${n} رسالة لم تُقرأ`, tone: 'info' },
}

/** The bell: what needs attention now, and (for a branch manager) the movements not read yet. */
export function NotificationsBell({ withFeed }: { withFeed: boolean }) {
  const now = useNow(60_000)
  const dashboard = usePolled<{ attention: Attention[] }>('/dashboard')
  const attention = (dashboard.data?.attention ?? []).filter((a) => ATTENTION[a.kind])
  const feed = useFeed(withFeed)
  const navigate = useNavigate()
  const [seen, markAll] = useSeen()
  const unread = useMemo(() => (feed ?? []).filter((e) => e.at > seen), [feed, seen])
  const count = attention.length + unread.length
  return (
    <TopPanel label="الإشعارات" button={(open, toggle) => (
      <button type="button" className="rbtn bell" aria-label={count ? `الإشعارات: ${count} جديدة` : 'الإشعارات'} title="الإشعارات" aria-expanded={open} onClick={toggle}>
        <Bell size={19} aria-hidden="true" />
        {count > 0 && <span className="bell-n num">{count > 9 ? '9+' : count}</span>}
      </button>
    )}>
      {(close) => {
        const go = (to?: string) => { close(); if (to) navigate(to) }
        return (
          <>
            <div className="notif-h">
              <b>الإشعارات</b>
              {count > 0 && <span className="sb-cnt red num">{count}</span>}
              <span className="grow" />
              {unread.length > 0 && <button type="button" className="link-btn" onClick={markAll}>تعليم الكل كمقروء</button>}
            </div>
            {attention.length > 0 && (
              <>
                <small className="notif-sec">تحتاج انتباهك</small>
                <ul className="notif-list">
                  {attention.map((a) => {
                    const k = ATTENTION[a.kind]!
                    const Icon = k.tone === 'info' ? Info : AlertTriangle
                    return (
                      <li key={a.kind}>
                        <button type="button" className="notif-i" data-tone={k.tone} onClick={() => go(a.link)}>
                          <span className="ni"><Icon size={16} aria-hidden="true" /></span>
                          <span className="nt"><b>{k.title(a.count)}</b></span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            {withFeed && (
              <>
                <small className="notif-sec">جديد لم تقرأه {unread.length > 0 && <span className="num">({unread.length})</span>}</small>
                <FeedRows rows={unread} seen={seen} now={now} go={go} empty="كل شيء مقروء." />
              </>
            )}
            {!withFeed && attention.length === 0 && <p className="notif-empty">لا توجد إشعارات جديدة.</p>}
          </>
        )
      }}
    </TopPanel>
  )
}
