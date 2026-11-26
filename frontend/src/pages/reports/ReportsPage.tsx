import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUser } from '../../app/auth'
import { addDays, describeDay, stamp, todayISO, type ISODate } from '../../lib/dates'
import { formatAmount } from '../../lib/numbers'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Segmented } from '../../ui/form'
import { Skeleton } from '../../ui/fx/Skeleton'
import { Button } from '../../ui/primitives'
import { ScrollTable } from '../../ui/ScrollTable'
import { useToast } from '../../ui/Toast'
import { weekStart } from '../attendance/WeekSheet'
import { SignFooter } from '../sheets/SignFooter'
import { buildReport, compareSection, dailySeries, daysOf, periodMetrics, type Cell, type ReportData, type Section } from './build'
import { downloadExcel } from './excel'
import { TrendChart } from './TrendChart'

type Period = 'week' | 'month'
const periods = [{ value: 'week', label: 'أسبوعي' }, { value: 'month', label: 'شهري' }] as const

const monthStart = (d: ISODate) => `${d.slice(0, 8)}01`
const monthEnd = (d: ISODate) => {
  const [y, m] = d.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
}
const monthName = (d: ISODate) => new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/** Weekly or monthly summary of everything, on screen, in Excel and on paper (as in the office's old system). */
export function ReportsPage() {
  useDocumentTitle('التقارير')
  const toast = useToast()
  const navigate = useNavigate()
  const user = useUser()
  const today = todayISO()
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(today)
  const [busy, setBusy] = useState(false)

  const from = period === 'week' ? weekStart(anchor) : monthStart(anchor)
  const to = period === 'week' ? addDays(weekStart(anchor), 6) : monthEnd(anchor)
  const prevFrom = period === 'week' ? addDays(from, -7) : monthStart(addDays(from, -1))
  const label = period === 'week' ? `الأسبوع ${describeDay(from).date} ← ${describeDay(to).date}` : `شهر ${monthName(from)}`
  const isCurrent = today >= from && today <= to
  const { data, error } = useLoad<ReportData>(`/reports?from=${from}&to=${to}&since=${prevFrom}`)

  const sections = useMemo(() => {
    if (!data) return null
    const main = buildReport(data, from, to)
    // A period still running is set against the same number of days at the start of the one before.
    const running = today >= from && today < to
    const upTo = running ? today : to
    const elapsed = daysOf(from, upTo).length
    const prevTo = running ? (addDays(prevFrom, elapsed - 1) < from ? addDays(prevFrom, elapsed - 1) : addDays(from, -1)) : addDays(from, -1)
    const first = running ? ` (أول ${elapsed} ${elapsed === 1 ? 'يوم' : elapsed <= 10 ? 'أيام' : 'يوماً'})` : ''
    const cmp = compareSection(periodMetrics(data, from, upTo), periodMetrics(data, prevFrom, prevTo), {
      now: (period === 'week' ? 'هذا الأسبوع' : 'هذا الشهر') + (running ? ' حتى الآن' : ''),
      before: (period === 'week' ? 'الأسبوع الذي قبله' : `شهر ${monthName(prevFrom)}`) + first,
    })
    return [cmp, ...main]
  }, [data, from, to, prevFrom, today, period])
  const trends = useMemo(() => (data ? dailySeries(data, from, to, today) : null), [data, from, to, today])
  const branchName = data?.branch.name ?? user.branch?.name ?? ''

  async function excel() {
    if (!sections) return
    setBusy(true)
    try {
      await downloadExcel(sections, `${branchName} · ${label}`, `report-${from}-${to}.xlsx`)
      toast('نُزّل ملف Excel')
    } catch {
      toast('تعذّر تجهيز الملف', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const move = (dir: -1 | 1) => setAnchor(period === 'week' ? addDays(from, 7 * dir) : addDays(dir < 0 ? from : to, dir))

  return (
    <div className="report-page reports">
      <header className="ph">
        <div>
          <h1>التقارير</h1>
          <p className="muted">ملخص المحروقات والمولدات والتوزيع والمهام والحضور لأي أسبوع أو شهر.</p>
        </div>
        <Segmented<Period> label="الفترة" value={period} options={periods} onChange={setPeriod} />
      </header>

      <div className="week-bar card">
        <button type="button" className="icon-btn" aria-label="الفترة السابقة" onClick={() => move(-1)}><ChevronRight size={18} /></button>
        <div className="week-label">
          <b>{isCurrent ? (period === 'week' ? 'هذا الأسبوع' : 'هذا الشهر') : period === 'week' ? 'الأسبوع' : 'الشهر'}</b>
          <span className="num">{label}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="الفترة التالية" disabled={isCurrent} onClick={() => move(1)}><ChevronLeft size={18} /></button>
        <div className="ph-actions">
          <Button variant="secondary" icon={<ScrollText size={17} />} onClick={() => navigate('/tasks/seal-work')}>كشف أعمال الأختام</Button>
          <Button variant="secondary" icon={<Printer size={17} />} onClick={() => window.print()}>طباعة / PDF</Button>
          <Button variant="primary" icon={<FileSpreadsheet size={17} />} busy={busy} disabled={!sections} onClick={() => void excel()}>Excel</Button>
        </div>
      </div>

      <ErrorBanner text={error} />
      {trends && (
        <div className="trends">
          <TrendChart title="استهلاك السولار في اليوم" unit="لتر" points={trends.consumption} empty="لا توجد تقارير توليد في هذه الفترة." />
          <TrendChart title="المهام المنجزة في اليوم" unit="مهمة" points={trends.tasksDone} empty="لم تُنجز مهام في هذه الفترة." />
        </div>
      )}

      {!sections ? <Skeleton kind="table" /> : sections.map((s) => <SectionCard key={s.key} section={s} />)}

      {sections && (
        <div className="print-sheet landscape report-print" aria-hidden="true">
          <header className="ps-head">
            <img src="/logo.webp" alt="" className="ps-logo" />
            <div className="ps-title">
              <b>تقرير {branchName} · {period === 'week' ? 'أسبوعي' : 'شهري'}</b>
              <span className="num">{label}</span>
            </div>
            <div className="ps-date">طُبع: <span className="num">{stamp(new Date().toISOString())}</span></div>
          </header>
          {sections.map((s) => (
            <div key={s.key} className="rp-block">
              <h2>{s.title}</h2>
              <ReportTable section={s} />
            </div>
          ))}
          <SignFooter />
        </div>
      )}
    </div>
  )
}

const show = (c: Cell) => (c === null || c === '' ? '—' : typeof c === 'number' ? formatAmount(c) : /^\d{4}-\d{2}-\d{2}$/.test(c) ? `${describeDay(c).weekday} ${describeDay(c).date.replace(/ \d{4}$/, '')}` : c)

/** One section as a table: the first column stays in view when the rest scroll; totals at the foot. */
export function ReportTable({ section }: { section: Section }) {
  return (
    <table className="tbl rpt-tbl">
      <thead>
        <tr>{section.columns.map((c, i) => <th key={i} scope="col" className={i === 0 ? 'l' : undefined}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {section.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => j === 0
            ? <th key={j} scope="row" className="l">{show(c)}</th>
            : <td key={j} className="num" data-label={section.columns[j]} data-empty={c === null || c === '' || undefined} data-tone={toneOf(c)}>{show(c)}</td>)}</tr>
        ))}
      </tbody>
      {section.total && (
        <tfoot>
          <tr>{section.total.map((c, j) => j === 0
            ? <th key={j} scope="row" className="l">{show(c)}</th>
            : <td key={j} className="num" data-label={section.columns[j]}>{show(c)}</td>)}</tr>
        </tfoot>
      )}
    </table>
  )
}

/** Colour only where it means something: a rise or fall in the comparison, a problem in the shipment check. */
function toneOf(c: Cell): string | undefined {
  if (typeof c !== 'string') return undefined
  if (/^‎\+/.test(c)) return 'up'
  if (/^‎−/.test(c)) return 'down'
  if (c.startsWith('الرقم مكرر') || c === 'دون رقم إرسالية') return 'warn'
  if (c === 'سليم') return 'ok'
  return undefined
}

function SectionCard({ section }: { section: Section }) {
  return (
    <section className="card rpt-card">
      <div className="card-h">
        <h2>{section.title}</h2>
        {section.note && <span className="meta">{section.note}</span>}
        {section.rows.length > 0 && <span className="rpt-count num">{section.rows.length} {section.key === 'fuel' || section.key === 'shipments' ? 'سطر' : 'بند'}</span>}
      </div>
      {section.rows.length === 0 ? <p className="card-empty">لا توجد بيانات في هذه الفترة.</p> : (
        <ScrollTable label={section.title}><ReportTable section={section} /></ScrollTable>
      )}
    </section>
  )
}
