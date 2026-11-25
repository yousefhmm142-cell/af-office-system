import { AlarmClock, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, ListChecks, PhoneIncoming, Plus, Printer, Search, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatLongDate } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { durationText, PRIORITY, STATUS, useMinutesSince, type Options, type Task } from './lib'
import '../../styles/branch-tasks.css'

export type BranchTaskView = 'waiting' | 'assigned' | 'late' | 'done'

interface Props {
  view: BranchTaskView
  tasks: Task[]
  options: Options | null
  day: string
  today: string
  search: string
  archive: boolean
  canManage: boolean
  loading: boolean
  error: string | null
  onView(value: BranchTaskView): void
  onSearch(value: string): void
  onDay(value: string): void
  onStep(amount: number): void
  onOpen(id: number): void
  onNew(prepare: boolean): void
}

export function BranchTasks({ view, tasks, options, day, today, search, archive, canManage, loading, error, onView, onSearch, onDay, onStep, onOpen, onNew }: Props) {
  const [technician, setTechnician] = useState<number | null>(null)
  const active = tasks.filter((task) => !['new', 'done', 'cancelled'].includes(task.status))
  const waiting = tasks.filter((task) => task.status === 'new')
  const late = active.filter((task) => task.late)
  const done = tasks.filter((task) => task.status === 'done')
  const groups = { waiting, assigned: active, late, done }
  const live = day === today && !search.trim() && !archive
  const selection = live ? groups[view] : archive ? tasks.filter((task) => task.status === 'done' || task.status === 'cancelled') : tasks
  const shown = technician === null ? selection : selection.filter((task) => task.assignees.some((person) => person.id === technician))
  const title = archive ? 'أرشيف الفنيين' : 'المهام الميدانية'
  const technicians = new Map((options?.technicians ?? []).map((person) => [person.id, person]))
  const names = new Map([...technicians.values()].map((person) => [person.id, person.name]))
  for (const task of tasks) for (const person of task.assignees) names.set(person.id, person.name)
  useDocumentTitle(title)

  return (
    <div className="tasks af-branch-tasks">
      <header className="ph">
        <div><h1>{title}</h1><p className="muted">{archive ? 'المهام المنجزة والملغاة حسب اليوم والفني.' : 'جهّز المهمة وأرسلها للفني، ثم تابع وقت إنجازها.'}</p></div>
        {archive && <Link className="btn" to="/tasks">العودة إلى المهام</Link>}
      </header>
      {!archive && <div className="task-search">
        <Search size={20} aria-hidden="true" />
        <input type="search" value={search} maxLength={80} onChange={(event) => onSearch(event.target.value)}
          placeholder="ابحث برقم المهمة أو المشترك أو الفني أو التفاصيل…" aria-label="بحث عام بالمهام" />
        {search && <button type="button" className="icon-btn" aria-label="مسح البحث" onClick={() => onSearch('')}><X size={18} /></button>}
      </div>}
      {!search.trim() && <div className="task-daybar" role="group" aria-label="اليوم">
        <button type="button" className="tdb-step" aria-label="اليوم السابق" onClick={() => onStep(-1)}><ChevronRight size={22} /></button>
        <label className="tdb-day"><CalendarDays size={18} aria-hidden="true" />
          <span><b>{day === today ? 'اليوم' : 'اليوم المحدد'}</b><small className="num">{formatLongDate(new Date(`${day}T12:00:00Z`))}</small></span>
          <input type="date" value={day} max={today} aria-label="تاريخ المهام" onChange={(event) => { if (event.target.value) onDay(event.target.value) }}
            onClick={(event) => { try { event.currentTarget.showPicker?.() } catch { /* Browser can use its normal calendar. */ } }} />
        </label>
        <button type="button" className="tdb-step" aria-label="اليوم التالي" disabled={day >= today} onClick={() => onStep(1)}><ChevronLeft size={22} /></button>
        {day !== today && <button type="button" className="tdb-today" onClick={() => onDay(today)}>العودة إلى اليوم</button>}
      </div>}
      {live && <div className="task-board" role="group" aria-label="حالة المهام">
        {([
          ['waiting', 'بانتظار فني', PhoneIncoming, 'brand'],
          ['assigned', 'عند الفنيين', ListChecks, ''],
          ['late', 'تجاوزت وقتها', AlarmClock, 'danger'],
          ['done', 'أُنجزت اليوم', CheckCheck, 'ok'],
        ] as const).map(([key, label, Icon, tone]) => (
          <button key={key} type="button" className="tb-tile" aria-pressed={view === key} data-tone={tone || undefined}
            onClick={() => { onView(key); setTechnician(null) }}>
            <span className="tb-top"><Icon size={17} />{label}</span><b className="num">{groups[key].length}</b>
          </button>
        ))}
      </div>}
      {!archive && <div className="ph-actions task-actions">
        <Link className="btn tasks-daily-entry" to="/tasks/daily"><Printer size={18} /> كشف إنجاز الفنيين</Link>
        <Link className="btn" to="/tasks?view=archive"><ListChecks size={18} /> أرشيف الفنيين</Link>
        <Link className="btn" to="/subscriber"><UserRound size={18} /> ملف مشترك</Link>
        {canManage && <>
          <Button icon={<Plus size={18} />} disabled={!options} onClick={() => onNew(false)}>مهمة جديدة</Button>
          <Button className="ph-action" variant="primary" icon={<PhoneIncoming size={18} />} disabled={!options} onClick={() => onNew(true)}>تجهيز مهمة</Button>
        </>}
      </div>}
      {(!live || view !== 'waiting') && names.size > 0 && <div className="chips task-filters" role="group" aria-label="الفني">
        <button type="button" className="chip" aria-pressed={technician === null} onClick={() => setTechnician(null)}>كل الفنيين</button>
        {[...names.entries()].map(([id, name]) => <button key={id} type="button" className="chip" aria-pressed={technician === id}
          onClick={() => setTechnician(id)}>{name}</button>)}
      </div>}
      <ErrorBanner text={error} />
      {loading && !tasks.length ? <Loading /> : shown.length ? (
        <section className={live && view === 'waiting' ? 'card prep-card' : undefined}>
          {live && view === 'waiting' && <div className="card-h"><PhoneIncoming size={18} /><h2>مهام مجهزة بانتظار فني</h2></div>}
          <ul className="task-list">{shown.map((task) => <li key={task.id}><LegacyTaskRow task={task} onOpen={() => onOpen(task.id)} /></li>)}</ul>
        </section>
      ) : <p className="card af-pad">{search.trim() ? 'لا توجد مهام تطابق البحث.' : 'لا توجد مهام في هذا العرض.'}</p>}
    </div>
  )
}

function LegacyTaskRow({ task, onOpen }: { task: Task; onOpen(): void }) {
  const since = useMinutesSince(task.started_at ?? task.sent_at)
  const duration = task.status === 'done' ? task.actual_minutes : since
  return (
    <button type="button" className="task-row card" data-late={task.late || undefined} onClick={onOpen}>
      <span className="task-no num">{task.number}</span>
      <span className="task-main">
        <span className="task-title"><b>{task.type?.name ?? 'مهمة ميدانية'}</b>{task.priority !== 'normal' && <Pill tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Pill>}</span>
        {task.details && <span className="task-details">{task.details}</span>}
        <span className="task-meta">{[task.subscriber_name, task.zone?.name, task.location_text, task.assignees.map((person) => person.name).join('، ')].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="task-side">
        <Pill tone={STATUS[task.status].tone}>{STATUS[task.status].label}</Pill>
        {duration !== null && <span className="task-clock num">{durationText(duration)}</span>}
      </span>
    </button>
  )
}
