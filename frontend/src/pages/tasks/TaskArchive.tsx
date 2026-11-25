import { Archive, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { config } from '../../config'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Logo } from '../../ui/primitives'
import { ReportDownloads } from '../../ui/ReportDownloads'
import { ScrollTable } from '../../ui/ScrollTable'
import { shiftDate } from '../attendance/WeekSheet'
import { STATUS, type Options, type Task } from './lib'
import { fold } from './subscribers'

const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone })
const headers = ['التاريخ', 'الفني', 'المرجع', 'العمل', 'المشترك', 'الحالة', 'ملاحظات']

export function TaskArchive({ branch, branchName, options, today, onOpen }: {
  branch: string; branchName?: string; options: Options | null; today: string; onOpen(id: number): void
}) {
  useDocumentTitle('أرشيف الفنيين')
  const [from, setFrom] = useState(() => shiftDate(today, -6))
  const [to, setTo] = useState(today)
  const [tech, setTech] = useState('')
  const [search, setSearch] = useState('')
  const sheet = useRef<HTMLDivElement>(null)
  const valid = !!from && !!to && from <= to && to <= today
  const { data, error, loading, reload } = useLoad<{ from: string; to: string; tasks: Task[] }>(branch && valid
    ? `/tasks/archive?branch_id=${branch}&from=${from}&to=${to}` : null)
  const current = valid && data?.from === from && data?.to === to ? data : null
  const names = new Map(options?.technicians.map((person) => [person.id, person.name]))
  for (const task of current?.tasks ?? []) for (const person of task.assignees) names.set(person.id, person.name)
  const query = fold(search).toLowerCase()
  const selected = (current?.tasks ?? []).filter((task) =>
    (!tech || task.assignees.some((person) => String(person.id) === tech))
    && fold([`#${task.number}`, task.type?.name, task.subscriber_name, task.details, task.completion_notes, task.cancel_reason].join(' ')).toLowerCase().includes(query))
  const rows = selected.map((task) => {
    const closedAt = task.completed_at ?? task.cancelled_at
    return [
      closedAt ? businessDate.format(new Date(closedAt)) : '—',
      task.assignees.map((person) => person.name).join('، ') || '—',
      `#${task.number}`, task.type?.name ?? '—', task.subscriber_name ?? '—', STATUS[task.status].label,
      (task.status === 'cancelled' ? task.cancel_reason : task.completion_notes) ?? task.details ?? '—',
    ]
  })

  return <section className="tasks af-task-archive">
    <header className="ph no-print"><h1>أرشيف الفنيين</h1><Link className="btn" to="/tasks">العودة إلى المهام</Link></header>
    <div className="card form-card archive-toolbar no-print">
      <Field label="من تاريخ">{(id) => <input id={id} className="input" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
      <Field label="إلى تاريخ">{(id) => <input id={id} className="input" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      <Field label="الفني">{(id) => <select id={id} className="input select" value={tech} onChange={(e) => setTech(e.target.value)}>
        <option value="">كل الفنيين</option>
        {[...names].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>}</Field>
      <Field label="بحث بالاسم أو العمل أو المرجع">{(id) => <input id={id} className="input" type="search" maxLength={120} value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
      <Button icon={<RefreshCw size={16} />} busy={valid && loading} disabled={!valid} onClick={() => void reload()}>تحديث</Button>
      <ReportDownloads sheet={sheet} name={`أرشيف الفنيين ${from} – ${to}`} headers={headers} rows={rows} />
    </div>
    <ErrorBanner text={!valid ? 'اختر فترة صحيحة.' : error} />
    {valid && loading && !current && <Loading />}
    {current && <section className="card archive-results no-print">
      <div className="card-h"><span className="ico-round brand"><Archive size={18} /></span>
        <h2>{names.get(Number(tech)) ?? 'كل الفنيين'}</h2><span className="meta num">{rows.length} مهام</span>
      </div>
      {rows.length ? <ScrollTable label="أرشيف الفنيين"><table className="tbl">
        <thead><tr>{headers.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={selected[index]!.id}>{row.map((value, column) =>
          <td key={column}>{column === 2 ? <button type="button" className="link-btn num" onClick={() => onOpen(selected[index]!.id)}>{value}</button> : value}</td>)}</tr>)}</tbody>
      </table></ScrollTable> : <p className="af-pad">لا توجد مهام مطابقة.</p>}
    </section>}
    {!!rows.length && <div ref={sheet} className="print-sheet landscape archive-print" aria-hidden="true">
      <header className="ps-head"><Logo className="ps-logo" />
        <div className="ps-title"><b>سجل أعمال الفنيين</b><span>{[branchName, names.get(Number(tech)) ?? 'كل الفنيين'].filter(Boolean).join(' · ')}</span></div>
      </header>
      <p>من {from} إلى {to} · {rows.length} مهام</p>
      <table><thead><tr>{headers.map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={selected[index]!.id}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody>
      </table>
      <footer className="ps-foot"><div><b>اعتماد مدير المكتب</b><span>____________________</span></div></footer>
    </div>}
  </section>
}
