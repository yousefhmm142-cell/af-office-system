import { ArrowRight, Search, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useUser } from '../../app/auth'
import { formatLongDate } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { ScrollTable } from '../../ui/ScrollTable'
import { STATUS, type Task } from './lib'
import { TaskSheet } from './TaskSheet'

export function SubscriberTasks() {
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const query = params.get('q')?.trim().slice(0, 80) ?? ''
  const [term, setTerm] = useState(query)
  const [open, setOpen] = useState<number | null>(null)
  const branch = user.branch?.id
  const { data, loading, error, reload } = useLoad<{ tasks: Task[] }>(
    query.length >= 2 && branch ? `/tasks?branch_id=${branch}&search=${encodeURIComponent(query)}` : null,
  )

  const normalized = query.toLocaleLowerCase('ar')
  const tasks = (data?.tasks ?? []).filter((task) => (
    task.subscriber_name?.toLocaleLowerCase('ar').includes(normalized) || task.subscriber_phone?.includes(query)
  ))

  return (
    <div className="tasks">
      <PageHead title="ملف مشترك" actions={<Link to="/tasks" className="btn"><ArrowRight size={17} /> العودة إلى المهام</Link>} />
      <section className="card af-pad">
        <form className="af-subscriber-search" onSubmit={(event) => { event.preventDefault(); setParams({ q: term.trim() }) }}>
          <Field label="اسم المشترك أو رقم جواله">
            {(id) => <input id={id} type="search" className="input" value={term} maxLength={80} onChange={(event) => setTerm(event.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" icon={<Search size={18} />} disabled={term.trim().length < 2}>بحث</Button>
        </form>
      </section>
      <ErrorBanner text={error} />
      {query.length >= 2 && loading && <Loading />}
      {query.length >= 2 && !loading && !error && (
        <section className="card">
          <div className="card-h"><UserRound size={18} /><h2>مهام المشترك</h2></div>
          {tasks.length ? <ScrollTable label="مهام المشترك">
            <table className="tbl">
              <thead><tr><th scope="col">المشترك</th><th scope="col">المهمة</th><th scope="col">التاريخ</th><th scope="col">الحالة</th></tr></thead>
              <tbody>{tasks.map((task) => (
                <tr key={task.id}>
                  <th scope="row">{task.subscriber_name ?? '—'}</th>
                  <td><button type="button" className="link-btn" onClick={() => setOpen(task.id)}>#{task.number} · {task.type?.name ?? 'مهمة ميدانية'}</button></td>
                  <td>{formatLongDate(new Date(task.created_at))}</td>
                  <td><Pill tone={STATUS[task.status].tone}>{STATUS[task.status].label}</Pill></td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollTable> : <p className="card-empty">لا توجد مهام تطابق اسم المشترك أو رقم جواله في هذا الفرع.</p>}
        </section>
      )}
      {open !== null && <TaskSheet id={open} options={null} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </div>
  )
}
