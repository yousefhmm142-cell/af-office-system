import {DailyUsagePlot,usageDate} from './DailyUsagePlot'
import {usageDays,type UsageRange} from './dailyUsage'
import {ScrollTable} from '../../ui/ScrollTable'
import {describeDay} from '../../lib/dates'
import { ChevronRight, ArrowLeft, Droplet, Gauge, Info, Plus, Printer, Timer, TrendingUp } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { addDays, dayName, toISODate, todayISO, type ISODate } from '../../lib/dates'
import { formatLongDate, formatNumber, formatTime, formatWeekday, greeting } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import { CountUp } from '../../ui/fx/CountUp'
import { fuelOutlook } from '../generation/alerts'
import { fuelForecast } from '../generation/forecast'
import { defaultAlertSettings, loadKva, logLoads, reportTotals, toBar, type SiteReport } from '../generation/model'

import { useOperations } from './data'

const fmt = (n: number) => formatNumber(Math.round(n))
const short = (d: ISODate) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`

/** Sent reports (no drafts), newest first. */
function useSentReports(): SiteReport[] | undefined {
  return useOperations()?.reports
}

/** True once, a moment after mounting: lets bars and rings grow in (the CSS skips it for reduced motion). */
function useShown() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(t)
  }, [])
  return on
}

/** Daily figures from the actual reports. Missing days remain visibly missing. */
export function UsageChart() {
 const reports=useSentReports(),[metric,setMetric]=useState<'fuel'|'hours'>('fuel'),[range,setRange]=useState<UsageRange>('all')
 const days=useMemo(()=>reports?usageDays(reports,todayISO(),range):null,[reports,range])
 if(!days)return <article className="hc-card hc-usage" aria-busy="true"/>
 const totals=days.reduce((a,d)=>({used:a.used+(d.fuel??0),hours:a.hours+(d.hours??0),received:a.received+(d.received??0)}),{used:0,hours:0,received:0})
 const known=days.filter(d=>d.fuel!==null).length
 return <article className="hc-card hc-usage">
  <div className="hc-h">
   <div className="hc-titles"><h2>{metric==='fuel'?'استهلاك السولار يومًا بيوم':'مجموع ساعات تشغيل المولدات يومًا بيوم'}</h2><small>{range==='all'?'كل الأيام':`آخر ${range} يوم`} · {known} تقرير مسجّل من {days.length} يوم</small></div>
   <span className="grow"/>
   <div className="hc-seg" role="group" aria-label="ما نعرضه"><button type="button" className={metric==='fuel'?'on':''} aria-pressed={metric==='fuel'} onClick={()=>setMetric('fuel')}>السولار</button><button type="button" className={metric==='hours'?'on':''} aria-pressed={metric==='hours'} onClick={()=>setMetric('hours')}>ساعات التشغيل</button></div>
   <div className="hc-seg" role="group" aria-label="المدة">{([7,30,90,'all'] as const).map(r=><button key={r} type="button" aria-pressed={range===r} className={range===r?'on':''} onClick={()=>setRange(r)}>{r==='all'?'كل الأيام':r===90?'3 أشهر':`${r} يوم`}</button>)}</div>
  </div>
  <p className="hc-daily-explain">{metric==='fuel'?'كل نقطة هي السولار المستهلك في يوم واحد باللتر، وليست رصيد الخزان.':'كل نقطة تجمع ساعات المولدات التي عملت في اليوم. مثال: مولّدان × 5 ساعات = 10 ساعات تشغيل.'} الفراغ يعني لا يوجد تقرير، والصفر يعني قيمة صفرية مسجّلة.</p>
  <DailyUsagePlot days={days} metric={metric}/>{!known && <p className="hc-daily-note">لم تصل تقارير توليد في هذه المدة؛ الأيام معروضة دون قيم.</p>}
  <div className="hc-minis"><div><small>إجمالي الاستهلاك</small><b className="num">{formatNumber(totals.used)} لتر</b></div><div><small>إجمالي الوارد</small><b className="num">{formatNumber(totals.received)} لتر</b></div><div><small>إجمالي ساعات المولدات</small><b className="num">{formatNumber(totals.hours)} ساعة</b></div><div><small>الاستهلاك لكل ساعة تشغيل</small><b className="num">{totals.hours?formatNumber(totals.used/totals.hours):'—'} لتر/ساعة</b></div></div>
  <details className="hc-daily-data"><summary>عرض جدول الأرقام لكل يوم</summary><ScrollTable label="استهلاك السولار وساعات التشغيل"><table className="tbl"><thead><tr><th>اليوم</th><th>التاريخ</th><th>السولار المستهلك (لتر)</th><th>الوارد (لتر)</th><th>مجموع ساعات المولدات</th></tr></thead><tbody>{[...days].reverse().map(d=><tr key={d.date}><td>{describeDay(d.date).weekday}</td><td><bdi className="num">{usageDate(d.date)}</bdi></td><td>{d.fuel===null?'لا تقرير':formatNumber(d.fuel)}</td><td>{d.received===null?'—':formatNumber(d.received)}</td><td>{d.hours===null?'—':formatNumber(d.hours)}</td></tr>)}</tbody></table></ScrollTable></details>
 </article>
}

/** A number that runs from 0 to its value (and moves again when the value changes), for the gauge. */
function useRunUp(target: number | null, key: string): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target === null) { setV(0); return }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    let frame = 0
    const start = performance.now() + 120
    const from = 0
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / 1500))
      setV(from + (target - from) * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    setV(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, key])
  return v
}

interface GenLoad { ran: boolean; id: number; name: string; pct: number | null; kva: number | null; cap: number | null; peak: { v: number; unit: string } | null; temp: number | null; oil: number | null }

/** Both generators share the chosen report day; initially the latest sent report. */
export function LoadGauge() {
  const reports = useSentReports()
  const generators = useOperations()?.generators
  const settings = defaultAlertSettings
  const [loadDay,setLoadDay]=useState<ISODate|null>(null)
  const date=loadDay ?? reports?.[0]?.reportDate
  const oldest=reports?.[reports.length-1]?.reportDate
  const canPrevious=!!date && !!oldest && date>oldest
  const selectedReport=reports?.find(r=>r.reportDate===date)
  const loads = useMemo<GenLoad[] | null>(() => {
    if (!selectedReport || !generators) return null
    const gens = new Map(generators.map((g) => [g.id, g]))
    return selectedReport.generators.map((log) => {
      const g = gens.get(log.generatorId)
      const l = log.didRun ? logLoads(log) : null
      const kva = l ? loadKva(l.loads, log.loadUnit, settings.phaseVoltage) : null
      const cap = g?.capacityKva ?? null
      return {
        ran: log.didRun,
        id: log.generatorId,
        name: g?.name ?? 'مولد',
        kva,
        cap,
        pct: kva !== null && cap ? Math.round((kva / cap) * 100) : null,
        peak: l ? { v: Math.max(...l.loads.map((v) => v ?? 0)), unit: log.loadUnit } : null,
        temp: log.temperatureC,
        oil: log.oilPressure !== null ? toBar(log.oilPressure, log.oilPressureUnit) : null,
      }
    }).sort((a,b)=>{
      const rank=(x:GenLoad)=>/caterpillar|cat\b|كترب|كتبل|كاترب|كاتر/i.test(`${x.name} ${gens.get(x.id)?.brand ?? ''}`)?0:1
      return rank(a)-rank(b) || a.id-b.id
    })
  }, [selectedReport, generators, settings.phaseVoltage])
  return <article className="hc-card hc-gauge">
    <div className="hc-h"><div className="hc-titles"><h2>حمل المولدات</h2><small className="hc-gauge-date"><span>{date ? `${selectedReport?'من تقرير':'اليوم'} ${dayName(date)} ${short(date)}` : 'لم يصل تقرير بعد'}</span><button type="button" className="hc-gauge-prev" aria-label="اليوم السابق لأحمال المولدات" title="اليوم السابق" disabled={!canPrevious} onClick={()=>{if(date)setLoadDay(addDays(date,-1))}}><ChevronRight size={14} aria-hidden="true"/></button></small></div></div>
    {loads?.length ? loads.map(gen=><GeneratorGauge key={gen.id} gen={gen} date={date ?? ''}/>) : <p className="hc-daily-note">{selectedReport?'لم تصل قراءات مولدات في هذا التقرير.':'لم يصل تقرير توليد لهذا اليوم.'}</p>}
  </article>
}

function GeneratorGauge({gen,date}:{gen:GenLoad;date:string}){
  const gradient=useId()
  const pct = gen?.pct ?? null
  const run = useRunUp(pct === null ? null : Math.min(100, Math.max(0, pct)), `${date}-${gen.id}`)
  const tone = pct === null ? 'muted' : pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'ok'
  // right to left like the design: 0% on the right, the needle turns left
  const cx = 140
  const cy = 140
  const R = 104
  const len = Math.PI * R
  const half = `M${cx + R},${cy}A${R},${R} 0 0 0 ${cx - R},${cy}`
  const da = Math.PI * 0.9

  return (
    <section className="hc-generator-load" aria-label={`حمل ${gen.name}`}>
      <div className="hc-generator-title"><h3>{gen.name}</h3>{pct!==null && <span className={`hc-pill ${tone}`}>{tone==='ok'?'ضمن الحدود':tone==='warn'?'قريب من الحد':'فوق الحد'}</span>}</div>
      <div className="hc-gauge-svg">
        <svg viewBox="0 0 280 160" role="img" aria-label={pct === null ? 'لا توجد قراءات حمل' : `حمل ${gen?.name ?? ''} ${pct}% من قدرته`}>
          <defs>
            <linearGradient id={gradient} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="#8E1B2B" />
              <stop offset=".6" stopColor="#E5485B" />
              <stop offset="1" stopColor="#FFB8C3" />
            </linearGradient>
          </defs>
          {Array.from({ length: 31 }, (_, i) => {
            const a = (Math.PI * i) / 30
            const big = i % 5 === 0
            const r1 = R + 16
            const r2 = R + (big ? 28 : 22)
            return <line key={i} className={`hc-tick${big ? ' big' : ''}`} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)} />
          })}
          <path className="hc-g-track" d={half} />
          {pct !== null && <path className="hc-g-val" style={{stroke:`url(#${gradient})`}} d={half} strokeDasharray={len} strokeDashoffset={len * (1 - run / 100)} />}
          <circle cx={cx + R * Math.cos(da)} cy={cy - R * Math.sin(da)} r={5} className="hc-g-limit"><title>حد الخطر 90%</title></circle>
          {pct !== null && (
            <g transform={`rotate(${(-180 * run) / 100} ${cx} ${cy})`}>
              <path className="hc-needle-p" d={`M${cx},${cy - 5}L${cx + R - 24},${cy}L${cx},${cy + 5}Z`} />
            </g>
          )}
          <circle cx={cx} cy={cy} r={10} className="hc-g-hub" />
          <circle cx={cx} cy={cy} r={4} className="hc-g-hub2" />
        </svg>
      </div>
      <div className="hc-g-center">
        <b className="num">{pct === null ? '—' : `${Math.round(run)}%`}</b>
        <small>{gen ? (pct === null ? `${gen.name}: ${gen.ran ? 'لا توجد قراءات حمل أو قدرة للمولد' : 'لم يعمل في هذا التقرير'}` : `${gen.name} · ${fmt(gen.kva!)} من ${fmt(gen.cap!)} kVA`) : 'لم يعمل أي مولد'}</small>
      </div>
      <div className="hc-trio">
        <div><b className="num">{gen?.peak ? `${fmt(gen.peak.v)} ${gen.peak.unit === 'A' ? 'A' : 'kW'}` : '—'}</b><small>أعلى حمل</small></div>
        <div><b className="num">{gen?.temp != null ? `${fmt(gen.temp)}°` : '—'}</b><small>الحرارة</small></div>
        <div><b className="num">{gen?.oil != null ? gen.oil.toFixed(1) : '—'}</b><small>ضغط الزيت (بار)</small></div>
      </div>
    </section>
  )
}

/** Every calendar day from the first stored report, with actual daily quantities. */
export function DailyBars(){
 const reports=useSentReports()
 const days=useMemo(()=>reports?usageDays(reports,todayISO(),'all'):null,[reports])
 if(!days)return <article className="hc-card" aria-busy="true"/>
 const known=days.filter(d=>d.fuel!==null)
 return <article className="hc-card hc-daily-history"><div className="hc-h"><div className="hc-titles"><h2>السولار باليوم — كل الأيام</h2><small>كل عمود يمثل استهلاك يوم واحد باللتر · {known.length} تقرير</small></div></div>{known.length?<DailyUsagePlot days={days} metric="fuel" bars/>:<p className="hc-empty">ما وصلت تقارير توليد بعد.</p>}</article>
}

/** This month's generation reports and distribution sheets: approved, waiting, not in. */
export function MonthRing() {
  const shown = useShown()
  const operations = useOperations()
  const today = todayISO()
  const month = today.slice(0, 7)
  const statuses = [
    ...(operations?.reports ?? []).filter((report) => report.reportDate.startsWith(month)).map((report) => report.status),
    ...(operations?.sheets ?? []).filter((sheet) => sheet.sheet_date.startsWith(month)).map((sheet) => sheet.status),
  ]
  const approved = statuses.filter((status) => status === 'approved').length
  const waiting = statuses.filter((status) => status === 'submitted').length
  const expected = Number(today.slice(8, 10)) * 2
  const data = operations && { approved, waiting, expected, missing: Math.max(0, expected - approved - waiting) }
  if (!data) return <article className="hc-card" aria-busy="true" />
  const pct = data.expected ? Math.round((data.approved / data.expected) * 100) : 0
  const C = 2 * Math.PI * 80
  return (
    <article className="hc-card">
      <div className="hc-h"><div className="hc-titles"><h2>تقارير الشهر</h2><small>التوليد والتوزيع</small></div></div>
      <div className="hc-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="hcRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--brand-hi)" />
              <stop offset="1" stopColor="var(--brand)" />
            </linearGradient>
          </defs>
          <circle className="hc-ring-bg" cx="100" cy="100" r="80" />
          <circle className="hc-ring-fg" cx="100" cy="100" r="80" strokeDasharray={C} strokeDashoffset={shown ? C * (1 - pct / 100) : C} />
        </svg>
        <div className="hc-ring-c"><b className="num">{pct}%</b><small className="num">{data.approved} من {data.expected} معتمدة</small></div>
      </div>
      <div className="hc-legend">
        <div><i className="brand" /><span>معتمدة</span><b className="num">{data.approved}</b></div>
        <Link to="/generation"><i className="warn" /><span>بانتظار اعتمادك</span><b className="num">{data.waiting}</b></Link>
        <div><i className="none" /><span>لم تصل أو قيد التعبئة</span><b className="num">{data.missing}</b></div>
      </div>
    </article>
  )
}

/** The diesel in hand: how long it lasts, by when to order, the last delivery. */
export function FuelCard() {
  const reports = useSentReports()
  const shown = useShown()
  const f = useMemo(() => {
    const latest = reports?.[0]
    if (!latest) return null
    const history = reports!.slice(1)
    const outlook = fuelOutlook(latest, history)
    const forecast = fuelForecast(latest, history)
    const lastIn = reports!.find((r) => reportTotals(r).received > 0)
    const month = todayISO().slice(0, 7)
    const monthIn = reports!.filter((r) => r.reportDate.startsWith(month)).reduce((a, r) => a + reportTotals(r).received, 0)
    // «full» = the most diesel held on one day in the last 60 reports (opening + received)
    const held = reports!.slice(0, 60).map((r) => r.fuel.reduce((a, l) => a + (l.totalQty ?? (l.openingBalance ?? 0) + (l.receivedQty ?? 0)), 0))
    const full = Math.max(1, ...held)
    return { latest, outlook, forecast, lastIn, monthIn, full }
  }, [reports])
  if (!reports) return null
  if (!f || f.outlook.days === null) return null
  const days = f.outlook.days
  const tone = days < 3 ? 'danger' : days < 7 ? 'warn' : 'ok'
  const level = Math.max(0, Math.min(100, Math.round((f.outlook.remaining / f.full) * 100)))
  const fill = Math.max(5, level)
  const today = todayISO()
  const span = f.forecast ? Math.max(1, (Date.parse(f.forecast.runOutDate) - Date.parse(today)) / 86_400_000) : null
  const orderAt = f.forecast && span ? Math.max(0, Math.min(100, ((Date.parse(f.forecast.orderBy) - Date.parse(today)) / 86_400_000 / span) * 100)) : null
  return (
    <article className="hc-card hc-fuel">
      <div className="hc-tank" data-tone={tone} title="من أكثر كمية كانت بالخزان آخر شهرين">
        <i style={{ height: shown ? `${fill}%` : 0 }} />
        <span className="hc-tank-marks" aria-hidden="true"><s /><s /><s /></span>
        <b className="num">{level}%</b>
      </div>
      <div className="hc-lead">
        <small>السولار · الرصيد المتبقي {f.latest.reportDate !== today && <>({dayName(f.latest.reportDate)})</>}</small>
        <b className="num">{fmt(f.outlook.remaining)}<em>لتر</em></b>
        <span className={`hc-pill ${tone}`}>يكفي نحو {Math.floor(days)} {Math.floor(days) === 1 ? 'يوم' : Math.floor(days) <= 10 ? 'أيام' : 'يوماً'}</span>
      </div>
      <div className="hc-tl">
        {f.forecast ? (
          <>
            <div className="hc-tl-h num"><span>اليوم <b>{short(today)}</b></span><span>ينفد تقريباً <b>{dayName(f.forecast.runOutDate)} {short(f.forecast.runOutDate)}</b></span></div>
            <div className="hc-tl-track">
              <div className="hc-tl-fill" style={{ width: shown ? '100%' : 0 }} />
              {orderAt !== null && <div className={`hc-tl-mark${orderAt > 50 ? ' flip' : ''}`} style={{ right: `${orderAt}%` }}><span className="num">اطلب قبل {dayName(f.forecast.orderBy)} {short(f.forecast.orderBy)}</span></div>}
            </div>
            {f.forecast.rough && <small className="hc-note">تقدير تقريبي: الأيام المسجّلة قليلة.</small>}
          </>
        ) : (
          <p className="hc-note">لا يكفي الاستهلاك المسجّل لحساب موعد نفاده.</p>
        )}
      </div>
      <div className="hc-facts">
        <div><span>آخر وارد</span><b className="num">{f.lastIn ? `${fmt(reportTotals(f.lastIn).received)} لتر · ${dayName(f.lastIn.reportDate)} ${short(f.lastIn.reportDate)}` : '—'}</b></div>
        <div><span>المعدّل اليومي</span><b className="num">{f.outlook.dailyAverage ? `${fmt(f.outlook.dailyAverage)} لتر` : '—'}</b></div>
        <div><span>الوارد هذا الشهر</span><b className="num">{fmt(f.monthIn)} لتر</b></div>
      </div>
    </article>
  )
}

/** A few plain facts worth noticing from the last 30 days. */
export function Insights() {
  const reports = useSentReports()
  const operations = useOperations()
  const data = useMemo(() => {
    if (!operations) return null
    const since = addDays(todayISO(), -30)
    const tasks = operations.tasks.filter((item) => item.createdAt && toISODate(new Date(item.createdAt)) >= since && item.status !== 'cancelled')
    const byType = new Map<string, number>()
    for (const task of tasks) if (task.type) byType.set(task.type, (byType.get(task.type) ?? 0) + 1)
    const [topType, topN] = [...byType].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    const mins = tasks.flatMap((task) => task.completedAt && task.startedAt
      ? [(Date.parse(task.completedAt) - Date.parse(task.startedAt)) / 60_000] : []).filter((value) => value >= 0 && value < 1440)
    return { total: tasks.length, topType, topShare: tasks.length ? Math.round(topN * 100 / tasks.length) : 0,
      avgMinutes: mins.length ? Math.round(mins.reduce((sum, value) => sum + value, 0) / mins.length) : null }
  }, [operations])
  const top = useMemo(() => {
    const since = addDays(todayISO(), -30)
    const recent = reports?.filter((r) => r.reportDate >= since) ?? []
    let best: { date: ISODate; v: number } | null = null
    let used = 0
    let hours = 0
    for (const r of recent) {
      const t = reportTotals(r)
      used += t.consumption
      hours += t.runHours
      if (!best || t.consumption > best.v) best = { date: r.reportDate, v: t.consumption }
    }
    return { best: best && best.v > 0 ? best : null, perHour: hours ? used / hours : null }
  }, [reports])
  if (!data) return null
  const items = [
    top.best && { icon: Droplet, tone: 'brand', label: 'أعلى يوم سولار', value: `${fmt(top.best.v)} لتر`, side: `${dayName(top.best.date)} ${short(top.best.date)}` },
    top.perHour && { icon: Gauge, tone: 'amber', label: 'لتر لكل ساعة تشغيل', value: top.perHour.toFixed(1), side: 'آخر 30 يوم' },
    data.topType && { icon: TrendingUp, tone: 'blue', label: 'أكثر نوع مهمة', value: data.topType, side: `${data.topShare}% من ${data.total}` },
    data.avgMinutes !== null && { icon: Timer, tone: 'green', label: 'معدّل وقت إنجاز المهمة', value: `${data.avgMinutes} دقيقة`, side: 'من البدء حتى الإنجاز' },
  ].filter(Boolean) as Array<{ icon: typeof Droplet; tone: string; label: string; value: string; side: string }>
  if (!items.length) return null
  return (
    <section className="hc-card hc-ins" aria-label="ما يلفت الانتباه">
      <div className="hc-h"><div className="hc-titles"><h2>ما يلفت الانتباه</h2><small>من آخر 30 يوم</small></div><span className="grow" /><Link to="/tasks?view=archive" className="hc-more">الأرشيف <ArrowLeft size={14} aria-hidden="true" /></Link></div>
      <div className="hc-ins-grid">
        {items.map((it) => (
          <div key={it.label} className="hc-ins-i">
            <span className={`hc-ico ${it.tone}`}><it.icon size={17} aria-hidden="true" /></span>
            <span className="hc-ins-t"><small>{it.label}</small><b className="num">{it.value}</b></span>
            <span className="hc-ins-v num">{it.side}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** The four boxes under the charts (like the design): what waits, open tasks, attendance, who is online. */
export function KpiBoxes({ here, total, open, late, canTasks }: { here: number; total: number; open: number; late: number; canTasks: boolean }) {
  const operations = useOperations()
  const shown = useShown()
  if (!operations) return <section className="hc-kbs" aria-busy="true" />
  const waitingSheets = operations.sheets.filter((sheet) => sheet.status === 'submitted').map((sheet) => sheet.sheet_date).sort()
  const waitingReport = operations.waitingReports[0]
  const waitingSheet = waitingSheets[0]
  const waiting = [...operations.waitingReports, ...waitingSheets].sort()
  const approvalPath = waitingReport && (!waitingSheet || waitingReport <= waitingSheet)
    ? `/generation?date=${waitingReport}` : waitingSheet ? `/distribution/${waitingSheet}` : '/distribution/history'
  const today = todayISO()
  const done = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6)
    return operations.tasks.filter((task) => task.completedAt && toISODate(new Date(task.completedAt)) === date).length
  })
  const present = operations.active
  const data = { here, total, hereYesterday: operations.presentYesterday, approvals: waiting.length, oldestWaiting: waiting[0],
    done }
  const pct = data.total ? Math.round((data.here / data.total) * 100) : 0
  const vsYesterday = data.here - data.hereYesterday
  const more = (to: string, label: string) => (
    <Link className="hc-kb-more" to={to}>{label}<ArrowLeft size={14} aria-hidden="true" /></Link>
  )
  return (
    <section className={`hc-kbs${shown ? ' go' : ''}${canTasks?' has-daily':''}`} aria-label="أرقام اليوم">
      {canTasks && <Link to="/tasks/daily" className="hc-kb daily-entry-card">
        <span className="daily-entry-icon"><Printer size={25} aria-hidden="true"/></span>
        <b>كشف إنجاز الفنيين</b>
        <span>اختر اليوم، وراجع العمل، واطبع الكشف.</span>
        <span className="daily-entry-foot">افتح الكشف <ArrowLeft size={18} aria-hidden="true"/></span>
      </Link>}
      <article className="hc-kb">
        <div className="hc-kb-lab">بانتظار اعتمادك <Info size={15} aria-hidden="true" /></div>
        <div className="hc-kb-v num"><CountUp value={data.approvals} /></div>
        <div className="hc-kb-d">{data.approvals ? <span className="hc-pill warn">من {dayName(data.oldestWaiting!)}</span> : <span className="hc-pill ok">لا شيء ينتظر</span>}</div>
        <svg className="hc-kb-pic" viewBox="0 0 96 64" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => {
            const lit = i < Math.min(4, data.approvals)
            const h = lit ? 52 : 30
            return <rect key={i} className={`hc-kb-bar${lit ? ' lit' : ''}`} x={96 - 4 * 16 - 3 * 8 + i * 24} y={60 - h} width={16} height={h} rx={8} style={{ transitionDelay: `${i * 90}ms` }} />
          })}
        </svg>
        {more(approvalPath, data.approvals ? 'افتحها' : 'الكشوف')}
      </article>
      <article className="hc-kb">
        <div className="hc-kb-lab">مهام مفتوحة <Info size={15} aria-hidden="true" /></div>
        <div className="hc-kb-v num"><CountUp value={open} /></div>
        <div className="hc-kb-d">{late ? <span className="hc-pill danger">{late} متأخرة</span> : <span className="hc-pill ok">لا تأخير</span>}<span className="num">أُنجز {data.done[6]}</span></div>
        <KbLine values={data.done} />
        {more('/tasks', 'عرض المهام')}
      </article>
      <article className="hc-kb">
        <div className="hc-kb-lab">حضور اليوم <Info size={15} aria-hidden="true" /></div>
        <div className="hc-kb-v num"><CountUp value={data.here} /><small>من {data.total}</small></div>
        <div className="hc-kb-d">{vsYesterday === 0 ? <span className="hc-pill">مثل أمس</span> : <span className={`hc-pill ${vsYesterday > 0 ? 'ok' : 'warn'}`}>{vsYesterday > 0 ? '↑' : '↓'} {Math.abs(vsYesterday)} عن أمس</span>}</div>
        <svg className="hc-kb-pic" viewBox="0 0 96 64" aria-hidden="true">
          <circle cx="48" cy="32" r="24" className="hc-kb-ring-bg" />
          <circle cx="48" cy="32" r="24" className="hc-kb-ring" strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - (shown ? pct : 0) / 100)} transform="rotate(-90 48 32)" />
          <text x="48" y="37" textAnchor="middle" className="hc-kb-ring-t num">{pct}%</text>
        </svg>
        {more('/attendance', 'عرض الحضور')}
      </article>
      <article className="hc-kb">
        <div className="hc-kb-lab">نشطون مؤخرًا <Info size={15} aria-hidden="true" /></div>
        <div className="hc-kb-v num"><CountUp value={present.length} /></div>
        <div className="hc-kb-d"><span className="hc-pill ok">آخر 5 دقائق</span></div>
        <svg className="hc-kb-pic" viewBox="0 0 96 64" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <circle key={i} className={`hc-kb-dot${i < Math.min(5, present.length) ? ' lit' : ''}`} cx={88 - i * 19} cy={32} r={7} style={{ transitionDelay: `${i * 70}ms` }} />)}
        </svg>
        <a className="hc-kb-more" href="#presence">عرض الأسماء<ArrowLeft size={14} aria-hidden="true" /></a>
      </article>
    </section>
  )
}

function KbLine({ values }: { values: number[] }) {
  const mx = Math.max(...values)
  const mn = Math.min(...values)
  // oldest on the right, today on the left
  const X = (i: number) => 96 - (i * 96) / (values.length - 1)
  const Y = (v: number) => 54 - ((v - mn) / (mx - mn || 1)) * 44
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const lx = X(values.length - 1)
  const ly = Y(values[values.length - 1]!)
  return (
    <svg className="hc-kb-pic" viewBox="0 0 96 64" aria-hidden="true">
      <path d={`${d}L${lx},64L96,64Z`} className="hc-kb-area" />
      <path d={d} className="hc-kb-line" />
      <circle cx={lx} cy={ly} r={4} className="hc-kb-line-dot" />
    </svg>
  )
}

/** The top of the home page, like the design: a live line, the greeting, and the two everyday buttons. */
export function HomeHeader({ name, doneToday, attention, canTasks }: { name: string; doneToday: number | null; attention: number; canTasks: boolean }) {
  const now = useNow()
  const operations = useOperations()
  const waiting = operations && operations.waitingReports.length + operations.sheets.filter((sheet) => sheet.status === 'submitted').length
  return (
    <header className="hc-head">
      <div className="hc-head-t">
        <span className="hc-live num">مباشر · {doneToday ?? '—'} مهمة أُنجزت اليوم · {waiting ?? '—'} بانتظار اعتمادك</span>
        <h1>{greeting(now)}، {name}</h1>
        <p className="num">
          {formatWeekday(now)} {formatLongDate(now)} · {formatTime(now)}
          {attention > 0 && <> · <a href="#today-attention">{attention === 1 ? 'أمر واحد يحتاج انتباهك' : `${attention} أمور تحتاج انتباهك`}</a></>}
        </p>
      </div>
      <span className="grow" />
      {canTasks && <div className="hc-head-b">
        <Link className="hc-btn primary" to="/tasks?new=1"><Plus size={17} aria-hidden="true" />مهمة جديدة</Link>
      </div>}
    </header>
  )
}
