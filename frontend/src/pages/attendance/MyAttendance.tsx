import { ChevronLeft, ChevronRight, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { clock12 } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { ScrollTable } from '../../ui/ScrollTable'
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
          <div className="card glass af-attendance-table">
            {data.days.length > 0 ? (
              <ScrollTable label="سجل حضوري">
                <table className="tbl">
                  <thead><tr><th scope="col">اليوم</th><th scope="col">الحضور</th><th scope="col">الانصراف</th><th scope="col">المدة</th><th scope="col">الحالة</th></tr></thead>
                  <tbody>{data.days.map((day) => (
                    <tr key={day.id}>
                      <th scope="row">{dayName(day.date)}{!day.is_work_day && <small className="af-sub">يوم عطلة</small>}</th>
                      <td className="af-time-in af-att-time">{clock12(day.check_in) || '—'}</td>
                      <td className="af-time-out af-att-time">{clock12(day.check_out) || '—'}</td>
                      <td className="num">{day.check_out ? hm(day.worked_minutes) : '—'}</td>
                      <td><span className="af-badges">
                        <Pill tone={day.approval_status === 'approved' ? 'ok' : 'neutral'}>{day.approval_status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}</Pill>
                        {day.manually_edited && <Pill>عُدّل يدويًا</Pill>}
                        {day.recorded_offline && <Pill tone="info" dot={false}><WifiOff size={12} /> دون إنترنت</Pill>}
                        {day.late_minutes > 0 && <Pill tone="warn">تأخير {day.late_minutes} دقيقة</Pill>}
                        {day.overtime_minutes > 0 && <Pill tone="ok">إضافي {hm(day.overtime_minutes)}</Pill>}
                      </span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </ScrollTable>
            ) : <p className="eyebrow af-pad">لا توجد أيام مسجّلة في هذا الشهر.</p>}
          </div>
        </>
      )}
    </>
  )
}
