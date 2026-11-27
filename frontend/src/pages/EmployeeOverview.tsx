import { Clock3, CalendarDays, Wallet } from 'lucide-react'
import { MonthField } from '../ui/MonthField'
import { ChoiceField } from '../ui/ChoiceField'
import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { EmployeeFile } from '../api/types'
import { todayISO } from '../lib/dates'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Button } from '../ui/primitives'
import { Loading } from '../ui/PageHead'

type Day = { date: string; state: keyof typeof states; shift: string | null; in: string | null; out: string | null; minutes: number; permission: boolean }
const states = { present: 'حضور', late: 'تأخير', absent: 'غياب', leave: 'إجازة', off: 'راحة', scheduled: 'دوام مجدول' }
const kinds = { collection: 'التحصيل وقراءة العدادات', technical: 'الصيانة', administration: 'المعاملات الإدارية' }
const fields = { collected: 'المبلغ المحصّل', target: 'المستهدف', bills: 'الفواتير', meters: 'العدادات المقروءة', zones: 'المناطق المسندة', repairs: 'الأعطال المُصلحة', response: 'متوسط الاستجابة بالدقائق', transactions: 'المعاملات المنجزة' }
const metrics = { collection: ['collected','target','bills','meters','zones'], technical: ['repairs','response'], administration: ['transactions'] } as const
type Report = { date: string; kind: keyof typeof kinds; metrics: Record<string,string | number> }
const payFields = { base: 'الراتب الأساسي', overtime: 'بدل العمل الإضافي', bonuses: 'المكافآت والبدلات المسجلة', manual_deductions: 'الخصومات اليدوية', auto_deductions: 'خصومات حضور سابقة', advance_deduction: 'قسط السلفة', net: 'صافي الدفعة' }
type Payment = { id: number; title: string } & Record<keyof typeof payFields, number>
// Western digits, as everywhere else in the system.
const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const shortDay = (iso?: string) => iso ? new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : ''
const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[]

/** A ring with a figure in the middle: «10 من 14». */
function Ring({ value, max, label, sub, tone = 'brand' }: { value: number; max: number | null; label: string; sub: string; tone?: 'brand' | 'ok' | 'warn' | 'info' }) {
  const r = 30, c = 2 * Math.PI * r
  const part = max ? Math.min(1, value / max) : 0
  return (
    <section className="emp-ring card" data-tone={tone}>
      <small className="emp-ring-label">{label}</small>
      <div className="emp-ring-svg">
        <svg viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r={r} className="emp-ring-track" />
          <circle cx="38" cy="38" r={r} className="emp-ring-bar" strokeDasharray={c} strokeDashoffset={c * (1 - part)} />
        </svg>
        <span className="num"><b>{value}</b>{max !== null && <small>/{max}</small>}</span>
      </div>
      <small className="emp-ring-sub">{sub}</small>
    </section>
  )
}

export function EmployeeOverview({ file, performance, documents, extra }: { file: EmployeeFile; performance: boolean; mine?: boolean; documents: React.ReactNode; extra?: React.ReactNode }) {
  const [month, setMonth] = useState(() => todayISO().slice(0,7))
  const [date, setDate] = useState('')
  const { data, error, loading, reload } = useLoad<{ calendar: Day[]; pay: Payment[] | null; reports: Report[]; leave_counts: Record<string,number> }>(`/employees/${file.user.id}/overview?month=${month}`)
  const active = data?.calendar.find(d => d.date === date)
  const annual = file.annual_leave
  const count = (state: Day['state']) => data?.calendar.filter((d) => d.state === state).length ?? 0
  const workDays = data?.calendar.filter((d) => d.state !== 'off' && d.state !== 'scheduled').length ?? 0
  const hours = data ? Math.round(data.calendar.reduce((sum,d)=>sum+d.minutes,0)/60*10)/10 : 0
  const peak = data ? Math.max(480, ...data.calendar.map(x=>x.minutes)) : 480
  const monthPicker = <MonthField value={month} onChange={(m)=>{setMonth(m);setDate('')}} aria-label="الشهر" className="emp-month" />

  if (performance) return <div className="emp-main emp-wide">
    <div className="emp-toolbar">{monthPicker}</div>
    <ErrorBanner text={error} />
    {loading && !data && <Loading />}
    {data && <>
      <div className="field-command">
        <section className="field-time"><Clock3 size={24}/><h2>ساعات العمل المسجّلة</h2><strong>{money.format(hours)}</strong><small>ساعة خلال الشهر</small></section>
        <section className="field-attendance"><h2>توزيع الحضور</h2><div className="attendance-orbits">
          {(['present','late','absent'] as const).map((state,index)=><div className="orbit-line" key={state}><span>{states[state]}</span><meter aria-label={states[state]} min={0} max={data.calendar.length} value={count(state)} data-tone={index}/><b>{count(state)}</b></div>)}
        </div></section>
      </div>
      <section className="card emp-card"><h3 className="emp-card-h">الإنتاجية اليومية</h3>
        {file.can.edit_job && <ReportForm key={file.user.id + month} userId={file.user.id} reports={data.reports} initialDate={month === todayISO().slice(0,7) ? todayISO() : month+'-01'} reload={reload} />}
        {!data.reports.length && <p className="muted">لا توجد سجلات أداء لهذا الشهر.</p>}
        <div className="af-performance-list">{data.reports.map(r=><article className="card af-pad" key={r.date+r.kind}><h3>{kinds[r.kind]}</h3><time className="num">{r.date}</time>
          <dl>{metrics[r.kind].map(k=><div key={k}><dt>{fields[k]}</dt><dd>{r.metrics[k]}</dd></div>)}</dl>
          {r.kind === 'collection' && Number(r.metrics.target)>0 && <><progress aria-label="نسبة التحصيل إلى المستهدف" value={Number(r.metrics.collected)} max={Number(r.metrics.target)} /><span> {Math.round(Number(r.metrics.collected)/Number(r.metrics.target)*100)}%</span></>}
        </article>)}</div>
      </section>
    </>}
  </div>

  return <>
    <div className="emp-main">
      <div className="emp-rings">
        <Ring label="الإجازة السنوية" value={annual.days === null ? annual.used : annual.days - annual.used} max={annual.days} sub={annual.days === null ? 'لم يُحدَّد الرصيد' : 'يوماً متبقية'} />
        <Ring label="أيام الحضور" value={count('present') + count('late')} max={workDays || null} sub="في هذا الشهر" tone="ok" />
        <Ring label="إجازات مرضية" value={data?.leave_counts.sick ?? 0} max={null} sub="في هذا الشهر" tone="warn" />
        <Ring label="الأذونات" value={data?.leave_counts.permission ?? 0} max={null} sub="في هذا الشهر" tone="info" />
      </div>
      <ErrorBanner text={error} />
      <section className="card emp-card emp-hours">
        <div className="emp-card-top"><h3 className="emp-card-h"><Clock3 size={18} /> ساعات العمل</h3>{monthPicker}</div>
        {loading && !data ? <Loading /> : <>
          <strong className="emp-big num">{money.format(hours)} <small>ساعة</small></strong>
          <div className="emp-bars" role="img" aria-label="ساعات العمل المسجلة لكل يوم من الشهر">
            {data?.calendar.map(d=><i key={d.date} data-state={d.state} title={`${shortDay(d.date)} · ${Math.round(d.minutes/6)/10} ساعة`} style={{height:Math.max(3,100*d.minutes/peak)+'%'}} />)}
          </div>
          <div className="bar-axis"><span>{shortDay(data?.calendar[0]?.date)}</span><span>{shortDay(data?.calendar.at(-1)?.date)}</span></div>
        </>}
      </section>
      <div className="emp-docs">{documents}</div>
    </div>
    <div className="emp-aside">
      <section className="card emp-card">
        <h3 className="emp-card-h"><CalendarDays size={18} /> الحضور والانصراف</h3>
        {data && <>
          <div className="af-calendar">{['س','ح','ن','ث','ر','خ','ج'].map(d=><small key={d}>{d}</small>)}
            {Array.from({length:(new Date(month+'-01T12:00:00Z').getUTCDay()+1)%7},(_,i)=><span key={i} />)}
            {data.calendar.map(d=><button type="button" key={d.date} data-state={d.state} title={states[d.state]} aria-label={shortDay(d.date)+' '+states[d.state]} aria-pressed={date===d.date} onClick={()=>setDate(d.date)}>{Number(d.date.slice(-2))}</button>)}
          </div>
          <div className="emp-legend">{(['present','late','absent','leave'] as const).map(s=><span key={s} data-state={s}><i />{states[s]}<b className="num">{count(s)}</b></span>)}</div>
          {active && <p className="emp-day">{shortDay(active.date)} · {states[active.state]}{active.permission && ' · إذن معتمد'} · دخول <span className="num">{active.in ?? '—'}</span> · خروج <span className="num">{active.out ?? '—'}</span></p>}
        </>}
      </section>
      <section className="card emp-card">
        <h3 className="emp-card-h"><Wallet size={18} /> ملخص الراتب</h3>
        {!data ? null : data.pay === null ? <p className="muted">يظهر لصاحب الملف ولأصحاب صلاحية الرواتب.</p> : !data.pay.length ? <p className="muted">لا توجد دفعات معتمدة لهذا الشهر.</p> : data.pay.map(pay=>(
          <div key={pay.id} className="emp-pay">
            <small className="emp-pay-title">{pay.title}</small>
            {keys(payFields).filter(k=>k!=='net' && (pay[k] || k==='base')).map(k=><div key={k} className="emp-kv"><span>{payFields[k]}</span><b className="num">{['manual_deductions','auto_deductions','advance_deduction'].includes(k) ? '−' : ''}{money.format(pay[k])} ₪</b></div>)}
            <div className="emp-kv emp-net"><span>الصافي</span><b className="num">{money.format(pay.net)} ₪</b></div>
          </div>
        ))}
      </section>
      {extra}
    </div>
  </>
}

function ReportForm({ userId, reports, initialDate, reload }: {userId:number; reports:Report[]; initialDate:string; reload():Promise<void>}) {
  const [date,setDate]=useState(initialDate)
  const [kind,setKind]=useState<keyof typeof kinds>('collection')
  const [error,setError]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const existing=reports.find(r=>r.date===date && r.kind===kind)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values=Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true); setError(''); setStatus('')
    try { await api(`/employees/${userId}/field-report`, {method:'PUT',body:{...values,date,kind}}); await reload(); setStatus('حُفظ التقرير') }
    catch(e) { setError(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر حفظ التقرير') }
    finally { setBusy(false) }
  }
  return <details className="af-pad"><summary>تسجيل أو تعديل أداء يومي</summary><form className="form-grid" onSubmit={save}>
    <div className="af-row2"><label>اليوم<input className="input" type="date" required value={date} onChange={e=>setDate(e.target.value)} /></label>
    <label>مجال العمل<ChoiceField className="input" value={kind} onChange={e=>setKind(e.target.value as keyof typeof kinds)}>{keys(kinds).map(k=><option key={k} value={k}>{kinds[k]}</option>)}</ChoiceField></label></div>
    <div key={date+kind} className="af-performance-inputs">{metrics[kind].map(k=><label key={k}>{fields[k]}<input name={k} className="input" required type={k==='zones'?'text':'number'} min="0" step={k==='collected'||k==='target'?'0.01':'1'} defaultValue={existing?.metrics[k] ?? ''} /></label>)}</div>
    <ErrorBanner text={error} /><div role="status">{status}</div><Button type="submit" variant="primary" busy={busy}>حفظ التقرير</Button>
  </form></details>
}
