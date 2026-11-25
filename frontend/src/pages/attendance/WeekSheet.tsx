import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { clock12 } from '../../lib/format'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { ScrollTable } from '../../ui/ScrollTable'
import { ReportDownloads } from '../../ui/ReportDownloads'
import { Logo } from '../../ui/primitives'
import { InOut } from './InOut'
import '../../styles/attendance-paper.css'
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

export function WeekSheet({ branch, branchName, start, today, branchStyle, revision, onWeek, onDay }: {
  branch: string; branchName?: string; start: string; today: string; branchStyle: boolean; revision: number
  onWeek(date: string): void
  onDay(date: string, row: BoardRow, canManage: boolean): void
}) {
  const [data, setData] = useState<Board[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<'all' | 'regular' | 'idle'>(branchStyle ? 'regular' : 'all')
  const sheet = useRef<HTMLDivElement>(null)
  const end = shiftDate(start, 6)
  const wholeWeek = Array.from({ length: 7 }, (_, index) => shiftDate(start, index))
  const dates = branchStyle ? wholeWeek.slice(0, 6) : wholeWeek
  const lastDate = dates.at(-1)!
  useEffect(() => {
    let active = true
    const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index)).filter((date) => date <= today)
    Promise.all(days.map((date) => api<Board>(`/attendance/board?branch_id=${branch}&date=${date}`))).then((result) => {
      if (active) setData(result)
    }).catch((e) => {
      if (active) setError(e instanceof ApiError ? e.message : 'تعذّر تحميل كشف الأسبوع.')
    })
    return () => { active = false }
  }, [branch, start, today, revision])

  const byDate = new Map(data?.map((day) => [day.date, new Map(day.rows.map((row) => [row.user.id, row]))]))
  const manageByDate = new Map(data?.map((day) => [day.date, day.can_manage]))
  const people = new Map(data?.flatMap((day) => day.rows.map(({ user, schedule_name }) => [user.id, { ...user, schedule_name }] as const)))
  const isIdle = (person: { schedule_name?: string | null }) => person.schedule_name?.includes('بطالة') ?? false
  const split = [...people.values()].some(isIdle)
  const roster = [...people.values()].filter((person) => group === 'all' || (group === 'idle') === isIdle(person))

  const headers = ['الموظف', ...dates.map((date) => dayName(date)), 'حضور', 'غياب']
  const records = roster.map((user) => {
    const week = wholeWeek.map((date) => byDate.get(date)?.get(user.id))
    return {
      user,
      days: week.slice(0, dates.length),
      present: week.filter((row) => row?.day?.check_in).length,
      absent: week.filter((row) => row?.state === 'absent').length,
    }
  })
  const reportRows = records.map(({ user, days, present, absent }) => [
    user.name,
    ...days.map((row) => {
      if (!row) return '—'
      if (!row.day?.check_in) return STATE[row.state].label
      return [clock12(row.day.check_in), clock12(row.day.check_out)].filter(Boolean).join(' – ')
    }),
    present,
    absent,
  ])

  return (
    <section aria-label="كشف الحضور الأسبوعي">
      <div className="week-bar card af-week-actions">
        <button type="button" className="icon-btn" aria-label="الأسبوع السابق" onClick={() => onWeek(shiftDate(start, -7))}><ChevronRight size={18} /></button>
        <span className="week-label"><b>{end >= today ? 'هذا الأسبوع' : 'الأسبوع'}</b><small>{dayName(start)} – {dayName(lastDate)}</small></span>
        <button type="button" className="icon-btn" aria-label="الأسبوع التالي" disabled={end >= today} onClick={() => onWeek(shiftDate(start, 7))}><ChevronLeft size={18} /></button>
        {(branchStyle || split) && <div className="segmented" role="radiogroup" aria-label="فئة كشف الحضور">
          {!branchStyle && <button type="button" role="radio" aria-checked={group === 'all'} onClick={() => setGroup('all')}>الجميع</button>}
          <button type="button" role="radio" aria-checked={group === 'regular'} onClick={() => setGroup('regular')}>الموظفون</button>
          <button type="button" role="radio" aria-checked={group === 'idle'} onClick={() => setGroup('idle')}>البطالة</button>
        </div>}
        <ReportDownloads sheet={sheet} name={`كشف الحضور ${branchName ?? ""} ${start}`} headers={headers} rows={reportRows} />
      </div>
      <ErrorBanner text={error} />
      {!data && !error && <Loading />}
      {data && !roster.length && <p className="card af-pad">لا توجد سجلات للفئة المحددة في هذا الأسبوع.</p>}
      {data && roster.length > 0 && (
        <>
        <div className="card week-card af-week-table">
          <h2 className="af-week-title">كشف الحضور{split && group === 'regular' ? ' للموظفين' : split && group === 'idle' ? ' للبطالة' : ''} من {dayName(start)} إلى {dayName(lastDate)}</h2>
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
                <th scope="col">حضور</th><th scope="col">غياب</th>
              </tr>
            </thead>
            <tbody>{records.map(({ user, days, present, absent }) => {
              return (
                <tr key={user.id}>
                  <th className="week-person" scope="row"><b>{user.name}</b><small>{[user.job_title, user.schedule_name].filter(Boolean).join(' · ')}</small></th>
                  {dates.map((date, index) => {
                    const row = days[index]
                    return <td key={date} data-status={row?.state}>{row ? (
                      <button type="button" className="week-cell af-att-time" onClick={() => onDay(date, row, manageByDate.get(date) === true)}>
                        {row.day?.check_in
                          ? <><InOut inAt={row.day.check_in} outAt={row.day.check_out} />
                            {!row.day.check_out && <small className="muted">{date === today ? 'في الدوام' : 'لم ينصرف'}</small>}</>
                          : <span className={`week-mark ${row.state}`}>{STATE[row.state].label}</span>}
                      </button>
                    ) : '—'}</td>
                  })}
                  <td className="num total">{present}</td><td className="num total" data-bad={absent > 0 || undefined}>{absent}</td>
                </tr>
              )
            })}</tbody>
          </table></ScrollTable>
        </div>
        <div ref={sheet} className="print-sheet landscape af-week-paper" aria-hidden="true">
          <header className="ps-head">
            <Logo height={46} className="ps-logo" />
            <div className="ps-title">
              <b>كشف الحضور والانصراف الأسبوعي{branchName ? ` · ${branchName}` : ''}</b>
              <span className="num">{dayName(start)} – {dayName(lastDate)}</span>
            </div>
            <div className="ps-date">طُبع <span className="num">{dayName(today)}</span></div>
          </header>
          <table className="att-print">
            <colgroup><col style={{ width: '3%' }} /><col style={{ width: '18%' }} />
              {dates.map((date) => <col key={date} style={{ width: `${69 / dates.length}%` }} />)}
              <col style={{ width: '5%' }} /><col style={{ width: '5%' }} />
            </colgroup>
            <thead><tr><th>م</th>{headers.map((label, index) => <th key={index}>{label}</th>)}</tr></thead>
            <tbody>{records.map(({ user, days, present, absent }, index) => <tr key={user.id}>
              <td className="num">{index + 1}</td>
              <td className="ap-name">{user.name}<small>{[user.job_title, user.schedule_name].filter(Boolean).join(' · ')}</small></td>
              {dates.map((date, i) => {
                const row = days[i]
                return <td key={date} className="num">{row?.day?.check_in
                  ? <InOut inAt={row.day.check_in} outAt={row.day.check_out} />
                  : date <= today && row ? STATE[row.state].label : ''}</td>
              })}
              <td className="num">{present}</td>
              <td className="num">{absent}</td>
            </tr>)}</tbody>
          </table>
          <footer className="ps-foot"><div><b>اعتماد مدير المكتب</b><span>____________________</span></div></footer>
        </div>
        </>
      )}
    </section>
  )
}
