import { ChoiceField } from '../../ui/ChoiceField'
import { ArrowRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Branch } from '../../api/types'
import { scopeOf, useUser } from '../../app/auth'
import { config } from '../../config'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { ReportDownloads } from '../../ui/ReportDownloads'
import { ScrollTable } from '../../ui/ScrollTable'
import { dayName } from '../attendance/lib'
import { timeOf, type Task } from './lib'

const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone })

interface WorkRow {
  name: string
  byType: Map<number, Task[]>
  tasks: Task[]
}

export function DailyTasks() {
  const user = useUser()
  const sheet = useRef<HTMLDivElement>(null)
  const all = scopeOf(user, 'tasks.view') === 'all' || scopeOf(user, 'tasks.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [branchId, setBranchId] = useState(String(user.branch?.id ?? ''))
  const [date, setDate] = useState(() => businessDate.format(new Date()))
  const [selected, setSelected] = useState<{ name: string; tasks: Task[] } | null>(null)
  const chosen = branchId || String(branches.data?.branches[0]?.id ?? '')
  const { data, error, loading } = useLoad<{ day: string; branch_id: number; tasks: Task[] }>(
    chosen ? `/tasks?branch_id=${chosen}&day=${date}` : null,
  )
  const current = data?.day === date && String(data.branch_id) === chosen ? data : null

  const { rows, types, totalTasks } = useMemo(() => {
    const people = new Map<number, WorkRow>()
    const types = new Map<number, string>()
    const completed = (current?.tasks ?? []).filter((task) => task.status === 'done'
      && task.completed_at && businessDate.format(new Date(task.completed_at)) === date)
    for (const task of completed) {
      const type = task.type?.id ?? 0
      types.set(type, task.type?.name ?? 'أعمال أخرى')
      const assignees = task.assignees.length ? task.assignees : [{ id: 0, name: 'دون فني مسند' }]
      for (const person of assignees) {
        const row = people.get(person.id) ?? { name: person.name, byType: new Map<number, Task[]>(), tasks: [] }
        const entries = row.byType.get(type) ?? []
        entries.push(task)
        row.byType.set(type, entries)
        row.tasks.push(task)
        people.set(person.id, row)
      }
    }
    return {
      rows: [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ar')),
      types: [...types.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')),
      totalTasks: completed.length,
    }
  }, [current, date])
  const branchName = (all ? branches.data?.branches.find((branch) => String(branch.id) === chosen)?.name : user.branch?.name) ?? user.branch?.name

  return (
    <section className="af-daily-work">
      <PageHead title="كشف إنجاز الفنيين" eyebrow={[branchName, dayName(date)].filter(Boolean).join(' · ')}
        actions={<div className="no-print"><Link className="btn" to="/tasks"><ArrowRight size={17} /> المهام الميدانية</Link></div>} />
      <div className="af-toolbar no-print">
        {all && <ChoiceField className="input select" aria-label="الفرع" value={chosen} onChange={(event) => setBranchId(event.target.value)}>
          {branches.data?.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
        </ChoiceField>}
        <input className="input af-date" type="date" value={date} max={businessDate.format(new Date())} aria-label="تاريخ الإنجاز"
          onChange={(event) => { if (event.target.value) setDate(event.target.value) }} />
        <ReportDownloads sheet={sheet} name={`كشف إنجاز الفنيين ${branchName ?? ''} ${date}`}
          headers={['الفني', ...types.map(([, label]) => label), 'المجموع']}
          rows={rows.map(([, row]) => [row.name, ...types.map(([id]) => row.byType.get(id)?.length ?? 0), row.tasks.length])} />
      </div>
      <ErrorBanner text={error ?? branches.error} />
      {(branches.loading && all && !branches.data || chosen && loading && !current) && <Loading />}
      {current && totalTasks === 0 && <p className="card glass af-pad">لا توجد مهام منجزة في هذا اليوم.</p>}
      {current && totalTasks > 0 && (
        <div ref={sheet} className="card glass af-daily-work-table landscape">
          <header className="af-sheet-pdf-head"><b>كشف إنجاز الفنيين</b><span>{[branchName, dayName(date)].filter(Boolean).join(' · ')}</span></header>
          <ScrollTable label="إنجاز الفنيين">
            <table className="tbl">
              <thead><tr><th scope="col">الفني</th>{types.map(([id, label]) => <th key={id} scope="col">{label}</th>)}<th scope="col">المجموع</th></tr></thead>
              <tbody>{rows.map(([id, row]) => (
                <tr key={id}>
                  <th scope="row">{row.name}</th>
                  {types.map(([typeId, label]) => (
                    <td key={typeId}>
                      {row.byType.has(typeId) ? <button type="button" className="link-btn num" aria-label={`${label} · ${row.name}`}
                        onClick={() => setSelected({ name: row.name, tasks: row.byType.get(typeId) ?? [] })}>
                        {row.byType.get(typeId)?.length}
                      </button> : '—'}
                    </td>
                  ))}
                  <td className="num">{row.tasks.length}</td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollTable>
          <p className="af-pad"><b>{totalTasks}</b> مهمة منجزة. تظهر المهمة المشتركة تحت اسم كل فني مشارك.</p>
        </div>
      )}
      {selected && <Dialog open title={selected.name} subtitle={dayName(date)} onClose={() => setSelected(null)}
        footer={<Button onClick={() => setSelected(null)}>إغلاق</Button>}>
        <ul className="rows af-daily-work-details">
          {selected.tasks.map((task) => <li className="row" key={task.id}>
            <span className="row-label">#{task.number} · {task.type?.name ?? 'مهمة ميدانية'}
              {task.completion_notes && <small className="af-sub">{task.completion_notes}</small>}
            </span>
            <span className="num">{timeOf(task.completed_at)}</span>
          </li>)}
        </ul>
      </Dialog>}
    </section>
  )
}
