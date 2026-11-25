import { AlarmClock, ArrowLeft, Building2, CalendarCheck, CircleDollarSign, ClipboardList, Inbox, ListTodo, Mail, Plus, Sparkles, UserX, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { User } from '../api/types'
import { can, useUser } from '../app/auth'
import { clock12, firstName, formatLongDate, formatTime, formatWeekday, greeting } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { navFor } from '../app/nav'
import { Pill } from '../ui/primitives'
import type { Board } from './attendance/lib'
import { PunchCard } from './attendance/PunchCard'
import { fmt } from './payroll/lib'

interface BranchRow { id: number; name: string; staff: number; present: number | null; late: number | null; not_in: number | null; open_tasks: number | null; late_tasks: number; done_today: number | null }
interface Dashboard {
  today: string
  me: { unread: number; open_tasks: number; last_pay: { net: number; title: string; status: string } | null; month: { days: number; late_minutes: number; overtime_minutes: number } | null }
  branches: BranchRow[]
  branch_detail?: { not_in: Array<{ id: number; name: string; job_title: string | null; start: string | null }>; trainees: number }
  company?: { branches: number; employees: number; profiles_pending: number | null; by_status: Record<'active' | 'trainee' | 'suspended' | 'terminated', number> }
  payroll?: { this_month: number; last_month: number; drafts: number; to_pay: number; can_approve: boolean }
  attention: Array<{ kind: string; count: number; link: string }>
}

const ATTENTION: Record<string, { icon: ReactNode; text: (n: number) => string; tone: 'warn' | 'info' }> = {
  payroll_draft: { icon: <Sparkles size={18} />, text: (n) => `${n} دفعة رواتب بانتظار المراجعة والاعتماد`, tone: 'warn' },
  payroll_to_pay: { icon: <CircleDollarSign size={18} />, text: (n) => `${n} دفعة رواتب معتمدة وجاهزة للصرف`, tone: 'info' },
  attendance_pending: { icon: <CalendarCheck size={18} />, text: (n) => `${n} يوم حضور سابق بانتظار الاعتماد`, tone: 'warn' },
  tasks_late: { icon: <AlarmClock size={18} />, text: (n) => `${n} مهمة ميدانية متأخرة عن وقتها`, tone: 'warn' },
  messages: { icon: <Mail size={18} />, text: (n) => `${n} رسالة لم تُقرأ`, tone: 'info' },
}

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} س ${m % 60 ? `${m % 60} د` : ''}` : `${m} د`)

/** The home page: what needs doing today first, then the figures this person may see. */
export function Home() {
  const user = useUser()
  const { data, error, loading } = useLoad<Dashboard>('/dashboard')
  const now = new Date()
  const role = user.role?.key
  const staff = role === 'employee'
  const finance = role === 'finance'
  const hr = role === 'hr'
  const titles: Record<string, string> = {
    branch_manager: 'إدارة الفرع', hr: 'شؤون الموظفين', finance: 'المالية',
    management: 'الإدارة', employee: 'مساحتي', super_admin: 'إدارة النظام',
  }
  const shortcuts = navFor(user).filter(({ to }) => (
    staff ? ['/attendance/me', '/my-tasks', '/me', '/my-pay'] :
    finance ? ['/payroll', '/messages'] :
    hr ? ['/users', '/attendance', '/payroll'] : ['/branches', '/attendance', '/payroll', '/audit']
  ).includes(to))
  const hasAttendance = !!user.branch && !!user.modules?.includes('attendance')

  if (role === 'branch_manager') return <BranchHome user={user} data={data} error={error} loading={loading} />

  return (
    <div className="home">
      <PageHead title={titles[role ?? ''] ?? 'الرئيسية'}
        eyebrow={`${formatWeekday(now)} · ${formatLongDate(now)} · ${user.role?.name ?? ''}${user.branch ? ` · فرع ${user.branch.name}` : ''}`} />
      <section className="af-dashboard-hero glass">
        <h2>{greeting(now)}، {firstName(user.name)}</h2>
        {hr && data?.company && <div className="af-hero-metrics">
          <span><b>{data.company.by_status.active}</b> موظفون فعّالون</span>
          <span><b>{data.company.by_status.trainee}</b> متدربون</span>
          {data.company.profiles_pending != null && <Link className="af-link" to="/users?profile=incomplete"><b>{data.company.profiles_pending}</b> ملفات شخصية غير مكتملة</Link>}
        </div>}
        {role === 'management' && data?.company && <div className="af-hero-metrics">
          <span><b>{data.company.branches}</b> فروع فعّالة</span>
          <span><b>{data.company.employees}</b> سجلات موظفين</span>
          {data.payroll?.can_approve && <span><b>{data.payroll.drafts}</b> دفعات بانتظار الاعتماد</span>}
        </div>}
        {finance && data?.payroll && <div className="af-hero-metrics">
          <span><b>{data.payroll.drafts}</b> دفعات مسودة</span>
          <span><b>{data.payroll.to_pay}</b> دفعات معتمدة بانتظار الصرف</span>
        </div>}
        <div className="af-dashboard-links" aria-label="اختصارات لوحة التحكم">
          {shortcuts.map(({ to, label, icon: Icon }) => (
            <Link className="btn" key={to} to={to}><Icon size={18} />{label}<ArrowLeft size={15} /></Link>
          ))}
        </div>
      </section>
      {hasAttendance && <PunchCard />}
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          {data.attention.length > 0 ? (
            <div className="af-attention">
              {data.attention.map((a) => {
                const k = ATTENTION[a.kind]
                return k && <Link key={a.kind} to={a.link} className={`af-attn ${k.tone}`}>{k.icon}<span>{k.text(a.count)}</span><ArrowLeft size={16} /></Link>
              })}
            </div>
          ) : (
            <p className="af-allclear"><Sparkles size={18} /> لا شيء ينتظرك الآن. كل شيء على ما يرام.</p>
          )}

          <div className="dash-kpis">
            {data.me.month && hasAttendance && (
              <Link to="/attendance/me" className="dash-kpi glass" data-tone="ok">
                <span className="dash-kpi-l"><CalendarCheck size={16} /> حضوري هذا الشهر</span>
                <span className="dash-kpi-n num">{data.me.month.days}</span>
                <small>يوم · تأخير {hm(data.me.month.late_minutes)} · إضافي {hm(data.me.month.overtime_minutes)}</small>
              </Link>
            )}
            {user.branch && user.modules?.includes('tasks') && user.field_worker && (
              <Link to="/my-tasks" className="dash-kpi glass" data-tone="info">
                <span className="dash-kpi-l"><ListTodo size={16} /> مهامي المفتوحة</span>
                <span className="dash-kpi-n num">{data.me.open_tasks}</span>
                <small>{data.me.open_tasks ? 'افتحها لتبدأ أو تُنهي' : 'لا مهام عندك الآن'}</small>
              </Link>
            )}
            <Link to="/messages" className="dash-kpi glass" data-tone={data.me.unread ? 'warn' : undefined}>
              <span className="dash-kpi-l"><Inbox size={16} /> رسائل جديدة</span>
              <span className="dash-kpi-n num">{data.me.unread}</span>
              <small>{data.me.unread ? 'بانتظار القراءة' : 'قرأت كل رسائلك'}</small>
            </Link>
            {data.me.last_pay && (
              <Link to="/my-pay" className="dash-kpi glass" data-tone="ok">
                <span className="dash-kpi-l"><Wallet size={16} /> آخر دفعة لك</span>
                <span className="dash-kpi-n num">{fmt(data.me.last_pay.net)}</span>
                <small>{data.me.last_pay.title}</small>
              </Link>
            )}
            {data.company && !staff && !finance && (
              <Link to="/users" className="dash-kpi glass">
                <span className="dash-kpi-l"><Users size={16} /> الموظفون</span>
                <span className="dash-kpi-n num">{data.company.employees}</span>
                <small>{data.company.branches} فروع · {data.company.by_status.trainee} متدرب · {data.company.by_status.suspended} موقوف</small>
              </Link>
            )}
            {data.payroll && (
              <Link to="/payroll" className="dash-kpi glass" data-tone="info">
                <span className="dash-kpi-l"><CircleDollarSign size={16} /> {data.payroll.this_month ? 'رواتب هذا الشهر' : 'رواتب الشهر الماضي'}</span>
                <span className="dash-kpi-n num">{fmt(data.payroll.this_month || data.payroll.last_month)}</span>
                <small>{finance ? `${data.payroll.to_pay} دفعة بانتظار الصرف` : data.payroll.drafts ? `${data.payroll.drafts} دفعة مسودة` : 'المعتمد والمصروف'}{data.payroll.this_month ? ` · الماضي ${fmt(data.payroll.last_month)}` : ''}</small>
              </Link>
            )}
          </div>

          {data.branch_detail && (
            <section className="card glass af-pad">
              <h2 className="af-h2"><UserX size={20} /> لم يسجّلوا دخولهم بعد اليوم</h2>
              {data.branch_detail.not_in.length === 0 ? <p className="eyebrow">حضر الجميع اليوم.</p> : (
                <div className="rows">
                  {data.branch_detail.not_in.map((p) => (
                    <Link key={p.id} to={`/employees/${p.id}`} className="row"><span className="row-label">{p.name}<small className="af-sub">{p.job_title ?? '—'}</small></span>{p.start && <span className="row-value num">يبدأ {p.start}</span>}</Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {data.branches.length > 0 && !staff && !finance && (
            <section className="card glass af-pad">
              <h2 className="af-h2"><Building2 size={20} /> {data.branches.length > 1 ? 'الفروع اليوم' : 'فرعك اليوم'}</h2>
              <div className="af-branch-grid">
                {data.branches.map((b) => (
                  <article key={b.id} className="af-branch-today">
                    <header><b>{b.name}</b><small>{b.staff} موظفاً</small></header>
                    {b.present !== null && (
                      <>
                        <div className="af-meter" role="img" aria-label={`حضر ${b.present} من ${b.staff}`}><i style={{ width: `${b.staff ? Math.round((b.present / b.staff) * 100) : 0}%` }} /></div>
                        <p><Link to="/attendance">حضر <b className="num">{b.present}</b> من <b className="num">{b.staff}</b></Link>{b.late ? <> · <span className="af-warn-t">متأخر <b className="num">{b.late}</b></span></> : null}</p>
                      </>
                    )}
                    {b.open_tasks !== null && (
                      <p><Link to="/tasks"><ClipboardList size={14} /> مهام مفتوحة <b className="num">{b.open_tasks}</b></Link>{b.late_tasks ? <> · <span className="af-danger-t">متأخرة <b className="num">{b.late_tasks}</b></span></> : null} · أُنجز اليوم <b className="num">{b.done_today}</b></p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {!can(user, 'branches.view') && !user.branch && !loading && data && data.branches.length === 0 && !data.company && (
        <p className="eyebrow">ستظهر هنا أرقامك حين تتوفر بيانات.</p>
      )}
    </div>
  )
}


function BranchHome({ user, data, error, loading }: { user: User; data: Dashboard | null; error: string | null; loading: boolean }) {
  const now = new Date()
  const branch = data?.branches.find((row) => row.id === user.branch?.id)
  const attention = data?.attention ?? []
  const pending = attention.find((item) => item.kind === 'attendance_pending')?.count ?? 0
  const shortcuts = navFor(user).filter(({ to }) => ['/attendance', '/tasks', '/users', '/branches'].includes(to))
  const { data: board } = useLoad<Board>(branch?.present != null ? `/attendance/board?branch_id=${branch.id}&date=${data?.today}` : null)
  const events = (board?.rows ?? []).flatMap(({ user: person, day }) => {
    if (!day) return []
    return [
      ...(day.check_in ? [{ key: `${person.id}-in`, name: person.name, time: day.check_in, kind: 'in' }] : []),
      ...(day.check_out ? [{ key: `${person.id}-out`, name: person.name, time: day.check_out, kind: 'out' }] : []),
    ]
  }).sort((a, b) => b.time.localeCompare(a.time))

  return (
    <div className="home af-branch-home">
      <PageHead title={`${greeting(now)}، ${firstName(user.name)}`}
        eyebrow={`${formatWeekday(now)} · ${formatLongDate(now)} · ${formatTime(now)}${user.branch ? ` · ${user.branch.name}` : ''}`}
        actions={can(user, 'tasks.manage') && <Link to="/tasks?new=1" className="btn primary"><Plus size={18} /> مهمة جديدة</Link>} />
      <ErrorBanner text={error} />
      {loading && !data && <Loading />}
      {data && <>
        <section className="af-branch-kpis" aria-label="أرقام اليوم">
          {branch?.done_today != null && <BranchStat title="إنجاز الفنيين اليوم" value={branch.done_today} to="/tasks/daily" action="فتح الكشف" featured />}
          {can(user, 'attendance.manage') && <BranchStat title="بانتظار اعتمادك" value={pending} to="/attendance?tab=week" action="عرض الكشف الأسبوعي" detail="أيام حضور سابقة" />}
          {branch?.open_tasks != null && <BranchStat title="مهام مفتوحة" value={branch.open_tasks} to="/tasks" action="عرض المهام"
            detail={<Pill tone={branch.late_tasks ? 'danger' : 'ok'}>{branch.late_tasks ? `${branch.late_tasks} متأخرة` : 'لا مهام متأخرة'}</Pill>} />}
          {branch?.present != null && <BranchStat title="حضور اليوم" value={branch.present} total={branch.staff} to="/attendance" action="عرض الحضور" />}
          <BranchStat title="رسائل جديدة" value={data.me.unread} to="/messages" action="فتح المراسلات" />
        </section>
        {board && <section className="card glass af-branch-activity">
          <header><h2>يومك</h2><Link to="/attendance">آخر تسجيلات الحضور <ArrowLeft size={14} /></Link></header>
          {events.length ? <ul>{events.slice(0, 8).map((event) => <li key={event.key}>
            <span className="num" data-kind={event.kind}>{clock12(event.time)}</span>
            <b>{event.name}</b>
            <small>{event.kind === 'in' ? 'حضور' : 'انصراف'}</small>
          </li>)}</ul> : <p>لا توجد تسجيلات حضور لهذا اليوم.</p>}
        </section>}
        {attention.length > 0 && <section aria-label="يتطلب انتباهك" className="af-attention">
          {attention.map(({ kind, count, link }) => {
            const item = ATTENTION[kind]
            return item && <Link key={kind} to={link} className={`af-attn ${item.tone}`}>{item.icon}<span>{item.text(count)}</span><ArrowLeft size={16} /></Link>
          })}
        </section>}
      </>}
      <section className="mod-grid" aria-label="وحدات الفرع">
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link className="mod-card glass" key={to} to={to}>
            <span className="mod-icon" aria-hidden="true"><Icon size={22} /></span>
            <b>{label}</b>
            <span className="mod-foot"><ArrowLeft size={18} aria-hidden="true" /></span>
          </Link>
        ))}
      </section>
      {branch?.present != null && <PunchCard />}
    </div>
  )
}

function BranchStat({ title, value, total, detail, to, action, featured }: {
  title: string; value: number; total?: number; detail?: ReactNode; to: string; action: string; featured?: boolean
}) {
  return (
    <article className={`af-branch-stat ${featured ? 'af-branch-stat-featured' : 'glass'}`}>
      <h2>{title}</h2>
      <div><strong className="num">{value}</strong>{total != null && <small> من {total}</small>}</div>
      {detail && <div>{detail}</div>}
      <Link to={to}>{action}<ArrowLeft size={15} /></Link>
    </article>
  )
}
