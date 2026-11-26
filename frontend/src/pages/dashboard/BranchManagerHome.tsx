import { ArrowLeft, Database, Wifi, WifiOff } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import type { User } from '../../api/types'
import { can } from '../../app/auth'
import { navFor } from '../../app/nav'
import { toISODate, todayISO } from '../../lib/dates'
import { firstName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { useOnline } from '../../lib/useOnline'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Avatar, Pill } from '../../ui/primitives'
import { ATTENTION, type Dashboard } from '../Home'
import { statusInfo, type SheetStatus } from '../sheets/workflow'
import { OperationsContext, useOperations, type Operations } from './data'
import { DayStrip } from './DayStrip'
import { DailyBars, FuelCard, HomeHeader, Insights, KpiBoxes, LoadGauge, MonthRing, UsageChart } from './HomeCharts'

const summaries: Record<string, string> = {
  '/generation': 'المحروقات والتشغيل والصيانات',
  '/distribution': 'ساعات التغذية والأحمال لكل منطقة',
  '/tasks': 'جهّز المهام وتابع إنجاز الفنيين',
  '/attendance': 'الحضور والانصراف والكشف الأسبوعي',
  '/seals': 'صرف الأختام وتسجيل استخدامها',
}

function LatestStatus({ status }: { status?: SheetStatus }) {
  return status ? <Pill tone={statusInfo[status].tone}>{statusInfo[status].label}</Pill> : <Pill dot={false}>لا شيء بعد</Pill>
}

export function BranchManagerHome({ user, data, error, loading }: { user: User; data: Dashboard | null; error: string | null; loading: boolean }) {
  useDocumentTitle('الرئيسية')
  const operations = useLoad<Operations>('/dashboard/branch-operations')
  const { reload } = operations
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 60_000)
    return () => window.clearInterval(id)
  }, [reload])
  const branch = data?.branches.find((item) => item.id === user.branch?.id)
  const attention = data?.attention ?? []
  const modules = ['/generation', '/distribution', '/tasks', '/attendance', '/seals'].flatMap((to) =>
    navFor(user).filter((item) => item.to === to))
  const canTasks = can(user, 'tasks.manage') && !!user.modules?.includes('tasks')
  const latestReport = operations.data?.reports[0]
  const latestSheet = operations.data?.sheets[0]

  return (
    <OperationsContext.Provider value={operations.data}>
    <div className="home branch-manager-home">
      <HomeHeader name={firstName(user.name)} doneToday={branch?.done_today ?? null} attention={attention.length} canTasks={canTasks} />
      <ErrorBanner text={error ?? operations.error} />
      {(loading || operations.loading) && !operations.data && <Loading />}

      <KpiBoxes here={branch?.present ?? 0} total={branch?.staff ?? 0} open={branch?.open_tasks ?? 0} late={branch?.late_tasks ?? 0} canTasks={canTasks} />
      <DayStrip />
      <div className="hc-main">
        <UsageChart />
        <LoadGauge />
      </div>

      <div className="hc-two">
        <DailyBars />
        <MonthRing />
      </div>
      <FuelCard />

      <div id="today-attention">
        {attention.length > 0 && <section className="card" aria-label="يتطلب انتباهك">
          <div className="card-h"><h2>يحتاج انتباهك</h2></div>
          <div className="af-attention">{attention.map(({ kind, count, link }) => {
            const item = ATTENTION[kind]
            return item && <Link key={kind} to={link} className={`af-attn ${item.tone}`}>{item.icon}<span>{item.text(count)}</span><ArrowLeft size={16} /></Link>
          })}</div>
        </section>}
      </div>
      <Insights />

      <section className="mod-grid" aria-label="الوحدات">
        {modules.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="mod-card glass">
            <span className="mod-icon" aria-hidden="true"><Icon size={22} /></span>
            <b>{label}</b>
            <span className="mod-summary">{summaries[to]}</span>
            <span className="mod-foot">
              {to === '/generation' && <LatestStatus status={latestReport?.status} />}
              {to === '/distribution' && <LatestStatus status={latestSheet?.status} />}
              {to === '/tasks' && <Pill tone={branch?.late_tasks ? 'danger' : 'brand'}>{branch?.open_tasks ?? 0} مفتوحة</Pill>}
              {to === '/attendance' && <Pill tone="ok">حضر {branch?.present ?? 0} من {branch?.staff ?? 0}</Pill>}
              <ArrowLeft size={18} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </section>

      <div id="presence" className="card">
        <div className="card-h"><h2>نشطون مؤخرًا</h2><span className="meta">آخر 5 دقائق</span></div>
        <div className="af-pad">{operations.data?.active.map((person) => <span className="pill" key={person.id}>{person.name}</span>)}
          {operations.data && operations.data.active.length === 0 && <span className="muted">لا يوجد نشاط حديث.</span>}
        </div>
      </div>

      {modules.some((item) => item.to === "/tasks") && <TechniciansToday />}
      <div className="home-row">
        <TeamCard />
        <SystemCard />
      </div>
    </div>
    </OperationsContext.Provider>
  )
}

export function TechniciansToday() {
  const today = todayISO()
  const data = useOperations()
  if (!data) return null
  const completed = data.tasks.filter((task) => task.completedAt && toISODate(new Date(task.completedAt)) === today)
  const people = data.team.filter((person) => person.title?.includes('فني'))
  return <section className="card fx-techs fx-decoration"><header className="card-h"><h2>الفنيون اليوم</h2></header>
    {!people.length ? <p className="card-empty">لا يوجد فنيون فعّالون بعد.</p> : <div className="fx-tech-grid">{people.map(p => {
      const own = data.tasks.filter(t => t.assignees.includes(p.id))
      const done = completed.filter(t=>t.assignees.includes(p.id)).length
      const open = own.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length
      const pct = done + open ? done / (done + open) * 100 : 0
      return <Link key={p.id} to="/tasks" className="fx-tech" aria-label={`${p.name}، أنجز ${done}، ولديه ${open}`}>
        <span className="fx-tech-avatar"><svg viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="30" fill="none" stroke="var(--track)" strokeWidth="3" /><circle className="fx-tech-ring" cx="34" cy="34" r="30" fill="none" stroke="var(--ok)" strokeWidth="3" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 34 34)" /></svg><Avatar name={p.name} size={48} /></span>
        <b>{p.name}</b><small>أنجز {done} · لديه {open}</small>
      </Link>
    })}</div>}
  </section>
}

function TeamCard() {
  const team = useOperations()?.team
  return (
    <section className="card team">
      <div className="card-h">
        <h2>الفريق</h2>
        {team && <span className="meta num">{team.length} أشخاص</span>}
      </div>
      {!team ? (
        <div className="skeleton-list" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
        </div>
      ) : team.length === 0 ? (
        <p className="card-empty">لا يوجد أحد بعد. يضيف مدير الفرع الفريق من الإعدادات.</p>
      ) : (
        <ul className="team-list">
          {team.map((e) => (
            <li key={e.id}>
              <Avatar name={e.name} size={36} />
              <span className="team-name">
                <b>{e.name}</b>
                <small>{e.title}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SystemCard() {
  const online = useOnline()

  return (
    <section className="card system">
      <div className="card-h">
        <h2>حالة النظام</h2>
      </div>
      <ul className="sys-list">
        <li>
          <span className="ico-round">{online ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
          <span>الاتصال</span>
          {online ? <Pill tone="ok">متصل</Pill> : <Pill tone="warn">بدون اتصال</Pill>}
        </li>
        <li>
          <span className="ico-round"><Database size={16} /></span>
          <span>البيانات</span>
          <Pill tone={online ? 'ok' : 'neutral'}>قاعدة بيانات الفرع</Pill>
        </li>
      </ul>
    </section>
  )
}
