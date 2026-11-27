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
import { BranchManagerHome } from './dashboard/BranchManagerHome'
import { CommandCenter } from './command/CommandCenter'

interface BranchRow { id: number; name: string; staff: number; present: number | null; late: number | null; not_in: number | null; open_tasks: number | null; late_tasks: number; done_today: number | null }
export interface Dashboard {
  today: string
  me: { unread: number; open_tasks: number; last_pay: { net: number; title: string; status: string } | null; month: { days: number; late_minutes: number; overtime_minutes: number } | null }
  branches: BranchRow[]
  branch_detail?: { not_in: Array<{ id: number; name: string; job_title: string | null; start: string | null }>; trainees: number }
  company?: { branches: number; employees: number; profiles_pending: number | null; by_status: Record<'active' | 'trainee' | 'suspended' | 'terminated', number> }
  payroll?: { this_month: number; last_month: number; drafts: number; to_pay: number; can_approve: boolean }
  attention: Array<{ kind: string; count: number; link: string }>
}

export const ATTENTION: Record<string, { icon: ReactNode; text: (n: number) => string; tone: 'warn' | 'info' }> = {
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
    management: 'الإدارة', employee: user.job_title || 'موظف', super_admin: 'إدارة النظام',
  }
  const hasAttendance = !!user.branch && !!user.modules?.includes('attendance')

  if (role === 'branch_manager') return <BranchManagerHome user={user} data={data} error={error} loading={loading} />
  // HR, management and the system admin get the command board.
  if (['hr', 'management', 'super_admin'].includes(role ?? '') && can(user, 'attendance.view')) return <CommandCenter />

  return (
    <div className="home">
      {/* The greeting is the title, as on the branch manager's home; figures only when there are some. */}
      <PageHead title={`${greeting(now)}، ${firstName(user.name)}`}
        eyebrow={`${formatWeekday(now)} · ${formatLongDate(now)} · ${titles[role ?? ''] ?? user.role?.name ?? ''}${user.branch ? ` · فرع ${user.branch.name}` : ''}`} />
      {((hr && data?.company) || (role === 'management' && data?.company) || (finance && data?.payroll)) && <section className="af-dashboard-hero glass">
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
      </section>}
      {role==='management' && data && <section className="card glass af-pad"><h2 className="af-h2">متابعة التشغيل اليوم</h2>
        <div className="af-hero-metrics">
        {data.branches.some(b=>b.open_tasks!==null) && <Link to="/tasks"><b>{data.branches.reduce((n,b)=>n+(b.open_tasks??0),0)}</b> مهام مفتوحة في الفروع</Link>}
        {data.branches.some(b=>b.done_today!==null) && <Link to="/tasks"><b>{data.branches.reduce((n,b)=>n+(b.done_today??0),0)}</b> مهام أُنجزت اليوم</Link>}
        {data.payroll && <Link to="/payroll"><b>{data.payroll.to_pay}</b> دفعات جاهزة للصرف</Link>}
        <Link to="/messages?folder=leaves">مراجعة طلبات الإجازة المحالة للإدارة</Link></div></section>}
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
                      <p><Link to={`/tasks?branch_id=${b.id}`}><ClipboardList size={14} /> مهام مفتوحة <b className="num">{b.open_tasks}</b></Link>{b.late_tasks ? <> · <span className="af-danger-t">متأخرة <b className="num">{b.late_tasks}</b></span></> : null} · أُنجز اليوم <b className="num">{b.done_today}</b></p>
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
