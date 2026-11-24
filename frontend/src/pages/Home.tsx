import { AlarmClock, ArrowLeft, Building2, CalendarCheck, CircleDollarSign, ClipboardList, Inbox, ListTodo, Mail, Sparkles, UserX, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { can, useUser } from '../app/auth'
import { firstName, formatLongDate, formatWeekday, greeting } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { PunchCard } from './attendance/PunchCard'
import { fmt } from './payroll/lib'

interface BranchRow { id: number; name: string; staff: number; present: number | null; late: number | null; not_in: number | null; open_tasks: number | null; late_tasks: number; done_today: number | null }
interface Dashboard {
  today: string
  me: { unread: number; open_tasks: number; last_pay: { net: number; title: string; status: string } | null; month: { days: number; late_minutes: number; overtime_minutes: number } | null }
  branches: BranchRow[]
  branch_detail?: { not_in: Array<{ id: number; name: string; job_title: string | null; start: string | null }>; trainees: number }
  company?: { branches: number; employees: number; by_status: Record<'active' | 'trainee' | 'suspended' | 'terminated', number> }
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
  const hasAttendance = !!user.branch && !!user.modules?.includes('attendance')

  return (
    <div className="home">
      <PageHead title={`${greeting(now)}، ${firstName(user.name)}`}
        eyebrow={`${formatWeekday(now)} · ${formatLongDate(now)} · ${user.role?.name ?? ''}${user.branch ? ` · فرع ${user.branch.name}` : ''}`} />
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
            {data.company && (
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
                <small>{data.payroll.drafts ? `${data.payroll.drafts} دفعة مسودة` : 'المعتمد والمصروف'}{data.payroll.this_month ? ` · الماضي ${fmt(data.payroll.last_month)}` : ''}</small>
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

          {data.branches.length > 0 && (
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
