import { ChevronLeft, ChevronRight, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Pill } from '../../ui/primitives'
import { PunchCard } from './PunchCard'
import { dayName, hm, monthName, type Mine } from './lib'

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function MyAttendance() {
  const [month, setMonth] = useState<string | null>(null)
  const { data, error, loading } = useLoad<Mine>(`/attendance/me${month ? `?month=${month}` : ''}`)
  const current = data?.month ?? month

  return (
    <>
      <PageHead title="حضوري" eyebrow="أيام الحضور، والتأخير، والوقت الإضافي" />
      <PunchCard />
      <div className="af-month">
        <button type="button" className="icon-btn" aria-label="الشهر التالي" onClick={() => current && setMonth(shift(current, 1))}><ChevronRight size={18} /></button>
        <b>{current ? monthName(current) : '…'}</b>
        <button type="button" className="icon-btn" aria-label="الشهر السابق" onClick={() => current && setMonth(shift(current, -1))}><ChevronLeft size={18} /></button>
      </div>
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="dash-kpis">
            <div className="dash-kpi glass"><span className="dash-kpi-l">أيام الحضور</span><span className="dash-kpi-n num">{data.totals.days}</span></div>
            <div className="dash-kpi glass" data-tone="ok"><span className="dash-kpi-l">ساعات العمل</span><span className="dash-kpi-n num">{hm(data.totals.worked_minutes)}</span></div>
            <div className="dash-kpi glass" data-tone="warn"><span className="dash-kpi-l">التأخير</span><span className="dash-kpi-n num">{hm(data.totals.late_minutes)}</span><small>{data.totals.late_days} يوماً</small></div>
            <div className="dash-kpi glass" data-tone="info"><span className="dash-kpi-l">الإضافي</span><span className="dash-kpi-n num">{hm(data.totals.overtime_minutes)}</span></div>
          </div>
          <div className="card glass rows">
            {data.days.map((d) => (
              <div key={d.id} className="row af-attrow">
                <span className="row-label">{dayName(d.date)}
                  <small className="af-sub">
                    {!d.is_work_day && 'يوم عطلة · '}{d.approval_status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}{d.manually_edited ? ' · عدّله المدير' : ''}
                  </small>
                </span>
                <span className="af-att-times num" dir="ltr">{d.check_in ?? '—'} → {d.check_out ?? '—'}</span>
                <span className="af-badges">
                  {d.recorded_offline && <Pill tone="info" dot={false}><WifiOff size={12} /> دون إنترنت</Pill>}
                  {d.late_minutes > 0 && <Pill tone="warn">تأخير {d.late_minutes} دقيقة</Pill>}
                  {d.overtime_minutes > 0 && <Pill tone="ok">إضافي {hm(d.overtime_minutes)}</Pill>}
                </span>
              </div>
            ))}
            {data.days.length === 0 && <p className="eyebrow af-pad">لا توجد أيام مسجّلة في هذا الشهر.</p>}
          </div>
        </>
      )}
    </>
  )
}
