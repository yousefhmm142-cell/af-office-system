import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { clock12 } from '../../lib/format'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { ScrollTable } from '../../ui/ScrollTable'
import { Button, Logo } from '../../ui/primitives'
import { dayName, STATE, type Board, type BoardRow } from './lib'

const weekDay = new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { weekday: 'long', timeZone: 'UTC' })
const weekDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', timeZone: 'UTC' })

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function weekStart(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  return shiftDate(date, -((weekday + 1) % 7))
}

export function WeekSheet({ branch, branchName, start, today, onWeek, onDay }: {
  branch: string; branchName?: string; start: string; today: string
  onWeek(date: string): void
  onDay(date: string, row: BoardRow, canManage: boolean): void
}) {
  const [data, setData] = useState<Board[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<'all' | 'regular' | 'idle'>('all')
  const end = shiftDate(start, 6)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(start, index))
  useEffect(() => {
    let active = true
    const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index)).filter((date) => date <= today)
    Promise.all(days.map((date) => api<Board>(`/attendance/board?branch_id=${branch}&date=${date}`))).then((result) => {
      if (active) setData(result)
    }).catch((e) => {
      if (active) setError(e instanceof ApiError ? e.message : 'تعذّر تحميل كشف الأسبوع.')
    })
    return () => { active = false }
  }, [branch, start, today])

  const byDate = new Map(data?.map((day) => [day.date, new Map(day.rows.map((row) => [row.user.id, row]))]))
  const manageByDate = new Map(data?.map((day) => [day.date, day.can_manage]))
  const people = new Map(data?.flatMap((day) => day.rows.map(({ user, schedule_name }) => [user.id, { ...user, schedule_name }] as const)))
  const isIdle = (person: { schedule_name?: string | null }) => person.schedule_name?.includes('بطالة') ?? false
  const split = [...people.values()].some(isIdle)
  const roster = [...people.values()].filter((person) => group === 'all' || !split || (group === 'idle') === isIdle(person))

  return (
    <section aria-label="كشف الحضور الأسبوعي">
      <div className="week-bar card af-week-actions">
        <button type="button" className="icon-btn" aria-label="الأسبوع السابق" onClick={() => onWeek(shiftDate(start, -7))}><ChevronRight size={18} /></button>
        <span className="week-label"><b>{end >= today ? 'هذا الأسبوع' : 'الأسبوع'}</b><small>{dayName(start)} – {dayName(end)}</small></span>
        <button type="button" className="icon-btn" aria-label="الأسبوع التالي" disabled={end >= today} onClick={() => onWeek(shiftDate(start, 7))}><ChevronLeft size={18} /></button>
        {split && <div className="segmented" role="radiogroup" aria-label="فئة كشف الحضور">
          <button type="button" role="radio" aria-checked={group === 'all'} onClick={() => setGroup('all')}>الجميع</button>
          <button type="button" role="radio" aria-checked={group === 'regular'} onClick={() => setGroup('regular')}>الموظفون</button>
          <button type="button" role="radio" aria-checked={group === 'idle'} onClick={() => setGroup('idle')}>البطالة</button>
        </div>}
        <Button icon={<Printer size={17} />} disabled={!roster.length} onClick={() => window.print()}>طباعة الكشف</Button>
      </div>
      <ErrorBanner text={error} />
      {!data && !error && <Loading />}
      {data && !roster.length && <p className="card af-pad">لا توجد سجلات للفئة المحددة في هذا الأسبوع.</p>}
      {data && roster.length > 0 && (
        <div className="card week-card af-week-table">
          <header className="af-week-print-head">
            <Logo height={46} />
            <div><b>شركة أبناء فارس أبو زايد</b>{branchName && <span> · فرع {branchName}</span>}</div>
          </header>
          <h2 className="af-week-title">كشف الحضور{split && group === 'regular' ? ' للموظفين' : split && group === 'idle' ? ' للبطالة' : ''} من {dayName(start)} إلى {dayName(end)}</h2>
          <ScrollTable label="كشف الحضور الأسبوعي"><table className="week">
            <thead>
              <tr>
                <th className="week-person" scope="col">الموظف</th>
                {dates.map((date) => {
                  const calendarDay = new Date(`${date}T12:00:00Z`)
                  return <th scope="col" key={date} data-today={date === today || undefined}>
                    {weekDay.format(calendarDay)}<small>{weekDate.format(calendarDay)}</small>
                  </th>
                })}
                <th scope="col">أيام الحضور</th><th scope="col">أيام الغياب</th>
              </tr>
            </thead>
            <tbody>{roster.map((user) => {
              const rows = dates.map((date) => byDate.get(date)?.get(user.id))
              const present = rows.filter((row) => row?.day?.check_in).length
              const absent = rows.filter((row) => row?.state === 'absent').length
              return (
                <tr key={user.id}>
                  <th className="week-person" scope="row"><b>{user.name}</b><small>{user.schedule_name ?? user.job_title}</small></th>
                  {dates.map((date, index) => {
                    const row = rows[index]
                    return <td key={date} data-status={row?.state}>{row ? (
                      <button type="button" className="week-cell af-att-time" onClick={() => onDay(date, row, manageByDate.get(date) === true)}>
                        {row.day?.check_in ? <span className="af-week-times">
                          <bdi className="af-time-in" dir="rtl">{clock12(row.day.check_in)}</bdi>
                          {row.day.check_out && <><span aria-hidden="true">–</span><bdi className="af-time-out" dir="rtl">{clock12(row.day.check_out)}</bdi></>}
                        </span> : STATE[row.state].label}
                      </button>
                    ) : '—'}</td>
                  })}
                  <td className="num total">{present}</td><td className="num total" data-bad={absent > 0 || undefined}>{absent}</td>
                </tr>
              )
            })}</tbody>
          </table></ScrollTable>
          <footer className="af-week-print-sign">توقيع مدير الفرع <span aria-hidden="true">____________________</span></footer>
        </div>
      )}
    </section>
  )
}
