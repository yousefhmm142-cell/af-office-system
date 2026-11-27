import { CalendarCheck, Clock3, FileHeart, Timer, CalendarDays } from 'lucide-react'
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

export function EmployeeOverview({ file, performance, documents }: { file: EmployeeFile; performance: boolean; mine?: boolean; documents: React.ReactNode }) {
  const [month, setMonth] = useState(() => todayISO().slice(0,7))
  const [date, setDate] = useState('')
  const { data, error, loading, reload } = useLoad<{ calendar: Day[]; pay: Payment[] | null; reports: Report[]; leave_counts: Record<string,number> }>(`/employees/${file.user.id}/overview?month=${month}`)
  const active = data?.calendar.find(d => d.date === date)
  const annual = file.annual_leave
  const balance = annual.days === null ? 'غير محدد' : String(annual.days - annual.used)
  return <div className="af-employee-overview">
    <div className="af-toolbar"><label>شهر العرض <MonthField value={month} onChange={(m)=>{setMonth(m);setDate('')}} aria-label="شهر العرض" /></label></div>
    <ErrorBanner text={error} />
    {loading && !data && <Loading />}
    {data && (performance ? <>
      <div className="field-command">
        <section className="field-time"><Clock3 size={24}/><h2>ساعات العمل المسجّلة</h2><strong>{money.format(Math.round(data.calendar.reduce((sum,d)=>sum+d.minutes,0)/60*10)/10)}</strong><small>ساعة خلال الشهر</small></section>
        <section className="field-attendance"><h2>توزيع الحضور</h2><div className="attendance-orbits">
          {(['present','late','absent'] as const).map((state,index)=>{
            const count=data.calendar.filter(d=>d.state===state).length
            return <div className="orbit-line" key={state}><span>{states[state]}</span><meter aria-label={states[state]} min={0} max={data.calendar.length} value={count} data-tone={index}/><b>{count}</b></div>
          })}
        </div></section>
        <section className="field-activity"><h2>نشاط الشهر</h2><div className="activity-mosaic">
          {data.calendar.map(d=><span key={d.date} data-state={d.state} title={d.date+' · '+states[d.state]}>{Number(d.date.slice(-2))}</span>)}
        </div></section>
      </div>
      <section className="card glass af-pad"><h2 className="af-h2">الإنتاجية اليومية</h2>
        {file.can.edit_job && <ReportForm key={file.user.id + month} userId={file.user.id} reports={data.reports} initialDate={month === todayISO().slice(0,7) ? todayISO() : month+'-01'} reload={reload} />}
        {!data.reports.length && <p>لا توجد سجلات أداء لهذا الشهر.</p>}
        <div className="af-performance-list">{data.reports.map(r=><article className="card af-pad" key={r.date+r.kind}><h3>{kinds[r.kind]}</h3><time>{r.date}</time>
          <dl>{metrics[r.kind].map(k=><div key={k}><dt>{fields[k]}</dt><dd>{r.metrics[k]}</dd></div>)}</dl>
          {r.kind === 'collection' && Number(r.metrics.target)>0 && <><progress aria-label="نسبة التحصيل إلى المستهدف" value={Number(r.metrics.collected)} max={Number(r.metrics.target)} /><span> {Math.round(Number(r.metrics.collected)/Number(r.metrics.target)*100)}٪</span></>}
        </article>)}</div>
      </section>
      <section className="card glass af-pad"><h2 className="af-h2">ساعات العمل المسجّلة</h2>
        <div className="af-work-activity">{data.calendar.map(d=><div key={d.date} title={`${d.date} · ${d.minutes} دقيقة`}>
          <progress aria-label={d.date+' ساعات العمل'} max={Math.max(480,...data.calendar.map(day=>day.minutes))} value={d.minutes} />
          <small>{Number(d.date.slice(-2))}</small></div>)}</div>
      </section>
      <section className="card glass af-pad"><h2 className="af-h2">الورديات وسجل الالتزام</h2><div className="af-planning-table"><table className="tbl"><thead><tr><th>اليوم</th><th>الوردية</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th></tr></thead><tbody>{data.calendar.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.shift ?? '—'}</td><td>{d.in ?? '—'}</td><td>{d.out ?? '—'}</td><td>{states[d.state]}{d.permission && ' · إذن معتمد'}</td></tr>)}</tbody></table></div></section>
    </> : <>
      <div className="leave-tiles">{[
        {name:'رصيد السنوية',value:balance,icon:CalendarDays},
        {name:'السنوية المستخدمة',value:annual.used,icon:CalendarCheck},
        {name:'أيام مرضية في الشهر',value:data.leave_counts.sick ?? 0,icon:FileHeart},
        {name:'أذونات الشهر',value:data.leave_counts.permission ?? 0,icon:Timer},
      ].map(({name,value,icon:Icon})=><section key={name}><Icon size={18}/><strong>{value}</strong><small>{name}</small></section>)}</div>
      <div className="profile-board">
        <section className="card glass af-pad hours-card"><h2 className="af-h2">ساعات العمل اليومية</h2>
          <strong>{money.format(Math.round(data.calendar.reduce((sum,d)=>sum+d.minutes,0)/60*10)/10)} <small>ساعة</small></strong>
          <div className="profile-bars" role="img" aria-label="ساعات العمل المسجلة لكل يوم من الشهر">
            {data.calendar.map(d=><i key={d.date} title={d.date+' · '+d.minutes+' دقيقة'} style={{height:Math.max(2,100*d.minutes/Math.max(480,...data.calendar.map(x=>x.minutes)))+'%'}} />)}
          </div><div className="bar-axis"><span>{shortDay(data.calendar[0]?.date)}</span><span>{shortDay(data.calendar.at(-1)?.date)}</span></div>
        </section>
        <section className="card glass af-pad"><h2 className="af-h2">تقويم الحضور والانصراف</h2>
          <div className="af-calendar">{['س','ح','ن','ث','ر','خ','ج'].map(d=><small key={d}>{d}</small>)}
            {Array.from({length:(new Date(month+'-01T12:00:00Z').getUTCDay()+1)%7},(_,i)=><span key={i} />)}
            {data.calendar.map(d=><button type="button" key={d.date} data-state={d.state} title={states[d.state]} aria-label={d.date+' '+states[d.state]} aria-pressed={date===d.date} onClick={()=>setDate(d.date)}>{Number(d.date.slice(-2))}</button>)}
          </div>
          <div className="af-calendar-key">{keys(states).map(s=><small key={s} data-state={s}>{states[s]}</small>)}</div>
          {active && <p>{active.date} · {states[active.state]}{active.permission && ' · إذن معتمد'} · دخول {active.in ?? '—'} · خروج {active.out ?? '—'}</p>}
        </section>
        <section className="card glass af-pad"><h2 className="af-h2">تفصيل الرواتب والبدلات</h2>
          {data.pay === null ? <p>عرض الراتب لصاحب الملف وأصحاب صلاحية الرواتب.</p> : !data.pay.length ? <p>لا توجد دفعات معتمدة لهذا الشهر.</p> : data.pay.map(pay=><table className="tbl" key={pay.id}><caption>{pay.title}</caption><tbody>{keys(payFields).filter(k=>pay[k] || k==='base' || k==='net').map(k=><tr key={k}><th scope="row">{payFields[k]}</th><td>{money.format(pay[k])} ₪</td></tr>)}</tbody></table>)}
        </section>
        <div className="board-docs">{documents}</div>
      </div>
    </>)}
  </div>
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
