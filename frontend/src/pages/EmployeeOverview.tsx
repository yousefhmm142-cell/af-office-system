import { CalendarDays, CalendarCheck, ChevronLeft, ChevronRight, Clock3, Palmtree, Receipt, Wallet } from 'lucide-react'
import { MonthField } from '../ui/MonthField'
import { ChoiceField } from '../ui/ChoiceField'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { EmployeeFile } from '../api/types'
import { todayISO } from '../lib/dates'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Button } from '../ui/primitives'
import { Loading } from '../ui/PageHead'
import { NxCard, NxDonut, NxEmpty, NxStat, type Hue } from '../ui/nx'

type State = 'present' | 'late' | 'absent' | 'leave' | 'off' | 'scheduled'
type Day = { date: string; state: State; shift: string | null; in: string | null; out: string | null; minutes: number; permission: boolean }
const states: Record<State, string> = { present: 'حضور', late: 'تأخير', absent: 'غياب', leave: 'إجازة', off: 'راحة', scheduled: 'لم يأتِ بعد' }
const stateHue: Record<State, Hue> = { present: 'mint', late: 'amber', absent: 'rose', leave: 'sky', off: 'slate', scheduled: 'slate' }
const kinds = { collection: 'التحصيل وقراءة العدادات', technical: 'الصيانة', administration: 'المعاملات الإدارية' }
const fields = { collected: 'المبلغ المحصّل', target: 'المستهدف', bills: 'الفواتير', meters: 'العدادات المقروءة', zones: 'المناطق المسندة', repairs: 'الأعطال المُصلحة', response: 'متوسط الاستجابة بالدقائق', transactions: 'المعاملات المنجزة' }
const metrics = { collection: ['collected','target','bills','meters','zones'], technical: ['repairs','response'], administration: ['transactions'] } as const
type Report = { date: string; kind: keyof typeof kinds; metrics: Record<string,string | number> }
const payFields = { base: 'الراتب الأساسي', overtime: 'العمل الإضافي', bonuses: 'المكافآت والبدلات', manual_deductions: 'خصومات', auto_deductions: 'خصومات الحضور', advance_deduction: 'قسط السلفة', net: 'الصافي' }
const minus = new Set(['manual_deductions', 'auto_deductions', 'advance_deduction'])
type Payment = { id: number; title: string } & Record<keyof typeof payFields, number>
type Overview = { calendar: Day[]; pay: Payment[] | null; reports: Report[]; leave_counts: Record<string, number> }

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const dayMonth = (iso?: string) => iso ? new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : ''
const weekday = (iso: string) => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
const hrs = (m: number) => m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : '—'
const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[]

export type EmpTab = 'overview' | 'attendance' | 'pay' | 'profile' | 'documents' | 'performance'

/** Everything in the employee file that depends on the chosen month. */
export function EmployeeBody({ file, tab, profile, documents, leave, personal }: { file: EmployeeFile; tab: EmpTab; profile: ReactNode; documents: ReactNode; leave: ReactNode; personal: ReactNode }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [date, setDate] = useState('')
  const { data, error, loading, reload } = useLoad<Overview>(`/employees/${file.user.id}/overview?month=${month}`)
  const picker = <MonthField value={month} onChange={(m) => { setMonth(m); setDate('') }} aria-label="الشهر" className="nx-month" />

  if (tab === 'profile') return <>{profile}</>
  if (tab === 'documents') return <>{documents}</>

  const days = data?.calendar ?? []
  const count = (s: State) => days.filter((d) => d.state === s).length
  const workDays = days.filter((d) => d.state !== 'off' && d.state !== 'scheduled').length
  const attended = count('present') + count('late')
  const minutes = days.reduce((s, d) => s + d.minutes, 0)
  const annual = file.annual_leave
  const net = data?.pay ? data.pay.reduce((s, p) => s + Number(p.net), 0) : null
  const active = days.find((d) => d.date === date)

  const shiftMonth = (by: number) => { const d = new Date(`${month}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); setMonth(d.toISOString().slice(0, 7)); setDate('') }
  const current = todayISO().slice(0, 7)
  const head = (
    <div className="nx-monthbar">
      <span className="nx-ico" data-hue="rose"><CalendarDays size={20} /></span>
      <div className="nx-monthbar-t"><small>الشهر المعروض</small>{picker}</div>
      <div className="nx-monthbar-nav">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="الشهر السابق" title="الشهر السابق"><ChevronRight size={18} /></button>
        <button type="button" onClick={() => shiftMonth(1)} disabled={month >= current} aria-label="الشهر التالي" title="الشهر التالي"><ChevronLeft size={18} /></button>
      </div>
      {month !== current && <button type="button" className="nx-monthbar-now" onClick={() => { setMonth(current); setDate('') }}>هذا الشهر</button>}
    </div>
  )

  if (!data) return <>{head}<ErrorBanner text={error} />{loading && <Loading />}</>

  if (tab === 'performance') return <>{head}<Performance file={file} month={month} reports={data.reports} reload={reload} minutes={minutes} days={days} /></>

  if (tab === 'pay') return <>
    {head}
    {data.pay === null ? <NxCard><NxEmpty icon={<Wallet size={26} />} title="الراتب غير ظاهر لك" text="يظهر لصاحب الملف ولأصحاب صلاحية الرواتب." /></NxCard>
      : !data.pay.length ? <NxCard><NxEmpty icon={<Receipt size={26} />} title="لا توجد دفعة لهذا الشهر" text="تظهر هنا الدفعة بعد اعتمادها." /></NxCard>
      : <div className="nx-receipts">{data.pay.map((p) => <PayReceipt key={p.id} pay={p} />)}</div>}
  </>

  if (tab === 'attendance') return <>
    {head}
    <div className="nx-split nx-split-even">
      <NxCard title="التقويم" icon={<CalendarDays size={17} />}>
        <Calendar month={month} days={days} date={date} onPick={setDate} big />
        <Legend count={count} />
      </NxCard>
      <NxCard title={active ? `${weekday(active.date)} ${dayMonth(active.date)}` : 'سجل الأيام'} icon={<Clock3 size={17} />} className="nx-daylog"
        action={active ? <Button className="sm" variant="ghost" onClick={() => setDate('')}>كل الأيام</Button> : undefined}>
        <div className="nx-log">
          {(active ? [active] : [...days].reverse().filter((d) => d.state !== 'scheduled')).map((d) => (
            <button type="button" key={d.date} className="nx-log-row" aria-pressed={d.date === date} onClick={() => setDate(d.date === date ? '' : d.date)}>
              <span className="nx-log-day"><b className="num">{Number(d.date.slice(-2))}</b><small>{weekday(d.date)}</small></span>
              <span className="nx-chip" data-hue={stateHue[d.state]}>{states[d.state]}{d.permission ? ' · بإذن' : ''}</span>
              <span className="nx-log-times num" dir="ltr">{d.in ?? '—'} – {d.out ?? '—'}</span>
              <b className="nx-log-h num" dir="ltr">{hrs(d.minutes)}</b>
            </button>
          ))}
        </div>
      </NxCard>
    </div>
  </>

  // Overview
  const peak = Math.max(480, ...days.map((d) => d.minutes))
  const today = todayISO()
  return <>
    {head}
    <ErrorBanner text={error} />
    <div className="nx-stats">
      <NxStat icon={<Clock3 size={19} />} hue="violet" label="ساعات العمل" value={money.format(Math.round(minutes / 6) / 10)} unit="ساعة" sub="مسجّلة في هذا الشهر" />
      <NxStat icon={<CalendarCheck size={19} />} hue="mint" label="أيام الحضور" value={attended} unit={workDays ? `من ${workDays}` : undefined} sub={count('late') ? `منها ${count('late')} بتأخير` : 'دون تأخير'} />
      <NxStat icon={<Palmtree size={19} />} hue="sky" label="رصيد الإجازة" value={annual.days === null ? '—' : annual.days - annual.used} unit={annual.days === null ? undefined : 'يوم'} sub={annual.days === null ? 'لم يُحدَّد بعد' : `استُخدم ${annual.used} من ${annual.days}`} />
      <NxStat icon={<Wallet size={19} />} hue="rose" label="صافي الراتب" value={net ? money.format(net) : '—'} unit={net ? '₪' : undefined} sub={net === null ? 'غير ظاهر لك' : net ? 'لهذا الشهر' : 'لم تُعتمد دفعة بعد'} />
    </div>
    <div className="nx-split">
      <NxCard title="ساعات العمل اليومية" icon={<Clock3 size={17} />}>
        <div className="nx-chart" role="img" aria-label="ساعات العمل لكل يوم">
          <div className="nx-chart-grid num"><span>{Math.round(peak / 60)}س</span><span>{Math.round(peak / 120)}س</span><span>0</span></div>
          <div className="nx-chart-bars">
            {days.map((d) => <span key={d.date} className="nx-bar" data-hue={stateHue[d.state]} data-today={d.date === today || undefined} title={`${dayMonth(d.date)} · ${hrs(d.minutes)} · ${states[d.state]}`}>
              <i style={{ height: `${Math.max(d.minutes ? 6 : 3, (100 * d.minutes) / peak)}%` }} />
            </span>)}
          </div>
        </div>
        <div className="nx-chart-axis num"><span>{dayMonth(days[0]?.date)}</span><span>{dayMonth(days.at(-1)?.date)}</span></div>
      </NxCard>
      <NxCard title="أيام الشهر" icon={<CalendarDays size={17} />}>
        <div className="nx-donut-wrap">
          <NxDonut parts={(['present', 'late', 'absent', 'leave'] as const).map((s) => ({ value: count(s), hue: stateHue[s] }))}
            center={workDays ? `${Math.round((attended / workDays) * 100)}%` : '—'} caption="نسبة الحضور" />
          <Legend count={count} list />
        </div>
      </NxCard>
    </div>
    <div className="nx-split3">
      {personal}
      <NxCard title="التقويم" icon={<CalendarDays size={17} />}>
        <Calendar month={month} days={days} date={date} onPick={setDate} />
        {active && <p className="nx-note">{weekday(active.date)} {dayMonth(active.date)} · {states[active.state]}{active.permission ? ' · بإذن معتمد' : ''} · دخول <span className="num">{active.in ?? '—'}</span> · خروج <span className="num">{active.out ?? '—'}</span></p>}
      </NxCard>
      {leave}
    </div>
  </>
}

function Legend({ count, list }: { count(s: State): number; list?: boolean }) {
  return <div className={list ? 'nx-legend-list' : 'nx-legend'}>
    {(['present', 'late', 'absent', 'leave'] as const).map((s) => <span key={s} data-hue={stateHue[s]}><i />{states[s]}<b className="num">{count(s)}</b></span>)}
  </div>
}

function Calendar({ month, days, date, onPick, big }: { month: string; days: Day[]; date: string; onPick(d: string): void; big?: boolean }) {
  const lead = (new Date(month + '-01T12:00:00Z').getUTCDay() + 1) % 7
  const today = todayISO()
  return <div className={`nx-cal${big ? ' nx-cal-big' : ''}`}>
    {['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].map((d) => <small key={d}>{big ? d : d.slice(0, 2)}</small>)}
    {Array.from({ length: lead }, (_, i) => <span key={i} />)}
    {days.map((d) => <button type="button" key={d.date} data-hue={stateHue[d.state]} data-state={d.state} data-today={d.date === today || undefined}
      aria-pressed={date === d.date} aria-label={`${dayMonth(d.date)} ${states[d.state]}`} title={states[d.state]} onClick={() => onPick(date === d.date ? '' : d.date)}>
      <span className="num">{Number(d.date.slice(-2))}</span>
    </button>)}
  </div>
}

function PayReceipt({ pay }: { pay: Payment }) {
  return <article className="nx-receipt">
    <header><span className="nx-ico" data-hue="rose"><Receipt size={18} /></span><b>{pay.title}</b></header>
    <div className="nx-receipt-rows">
      {keys(payFields).filter((k) => k !== 'net' && (pay[k] || k === 'base')).map((k) => (
        <div key={k} data-minus={minus.has(k) || undefined}><span>{payFields[k]}</span><b className="num">{minus.has(k) ? '− ' : ''}{money.format(pay[k])}</b></div>
      ))}
    </div>
    <footer><span>الصافي</span><strong className="num">{money.format(pay.net)} <small>₪</small></strong></footer>
  </article>
}

function Performance({ file, month, reports, reload, minutes, days }: { file: EmployeeFile; month: string; reports: Report[]; reload(): Promise<void>; minutes: number; days: Day[] }) {
  const count = (s: State) => days.filter((d) => d.state === s).length
  return <>
    <div className="nx-stats nx-stats-3">
      <NxStat icon={<Clock3 size={19} />} hue="violet" label="ساعات العمل" value={money.format(Math.round(minutes / 6) / 10)} unit="ساعة" />
      <NxStat icon={<CalendarCheck size={19} />} hue="mint" label="أيام الحضور" value={count('present') + count('late')} unit="يوم" sub={`تأخير ${count('late')} · غياب ${count('absent')}`} />
      <NxStat icon={<Receipt size={19} />} hue="amber" label="سجلات الأداء" value={reports.length} unit="سجل" />
    </div>
    <NxCard title="الإنتاجية اليومية" icon={<Receipt size={17} />}>
      {file.can.edit_job && <ReportForm key={file.user.id + month} userId={file.user.id} reports={reports} initialDate={month === todayISO().slice(0, 7) ? todayISO() : month + '-01'} reload={reload} />}
      {!reports.length && <NxEmpty icon={<Receipt size={26} />} title="لا توجد سجلات أداء لهذا الشهر" />}
      <div className="nx-perf">{reports.map((r) => <article key={r.date + r.kind}>
        <header><b>{kinds[r.kind]}</b><time className="num">{dayMonth(r.date)}</time></header>
        <dl>{metrics[r.kind].map((k) => <div key={k}><dt>{fields[k]}</dt><dd className="num">{r.metrics[k]}</dd></div>)}</dl>
        {r.kind === 'collection' && Number(r.metrics.target) > 0 && <div className="nx-progress"><i style={{ width: `${Math.min(100, Math.round((Number(r.metrics.collected) / Number(r.metrics.target)) * 100))}%` }} /><span className="num">{Math.round((Number(r.metrics.collected) / Number(r.metrics.target)) * 100)}%</span></div>}
      </article>)}</div>
    </NxCard>
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
  return <details className="nx-details"><summary>تسجيل أو تعديل أداء يومي</summary><form className="form-grid" onSubmit={save}>
    <div className="af-row2"><label className="field"><span className="label">اليوم</span><input className="input" type="date" required value={date} onChange={e=>setDate(e.target.value)} /></label>
    <label className="field"><span className="label">مجال العمل</span><ChoiceField className="input" value={kind} onChange={e=>setKind(e.target.value as keyof typeof kinds)}>{keys(kinds).map(k=><option key={k} value={k}>{kinds[k]}</option>)}</ChoiceField></label></div>
    <div key={date+kind} className="af-performance-inputs">{metrics[kind].map(k=><label className="field" key={k}><span className="label">{fields[k]}</span><input name={k} className="input" required type={k==='zones'?'text':'number'} min="0" step={k==='collected'||k==='target'?'0.01':'1'} defaultValue={existing?.metrics[k] ?? ''} /></label>)}</div>
    <ErrorBanner text={error} /><div role="status">{status}</div><Button type="submit" variant="primary" busy={busy}>حفظ التقرير</Button>
  </form></details>
}
