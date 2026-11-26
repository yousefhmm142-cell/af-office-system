import { AlarmClock, ArrowRightLeft, CalendarDays, CheckCheck, Undo2, ChevronLeft, ChevronRight, ListChecks, PhoneIncoming, Plus, Printer, Search, UserRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { can, useUser } from '../../app/auth'
import { formatLongDate } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { api, ApiError } from '../../api/client'
import { useConfirm } from '../../ui/Confirm'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'
import { durationText, PRIORITY, STATUS, useMinutesSince, type Options, type Task } from './lib'

export type BranchTaskView = 'waiting' | 'assigned' | 'late' | 'done'

interface Props {
  view: BranchTaskView
  tasks: Task[]
  options: Options | null
  day: string
  today: string
  search: string
  canManage: boolean
  subscriberImport?: ReactNode
  loading: boolean
  error: string | null
  onView(value: BranchTaskView): void
  onSearch(value: string): void
  onDay(value: string): void
  onStep(amount: number): void
  onOpen(id: number): void
  onNew(prepare: boolean): void
  /** After «تم» or «إرجاع لانتظار فني» from the list. */
  onChanged?(): void
}

export function BranchTasks({ view, tasks, options, day, today, search, canManage, subscriberImport, loading, error, onView, onSearch, onDay, onStep, onOpen, onNew, onChanged }: Props) {
  const user = useUser()
  const [technician, setTechnician] = useState<number | null>(null)
  const active = tasks.filter((task) => !['new', 'done', 'cancelled'].includes(task.status))
  const waiting = tasks.filter((task) => task.status === 'new')
  const late = active.filter((task) => task.late)
  const done = tasks.filter((task) => task.status === 'done')
  const groups = { waiting, assigned: active, late, done }
  const live = day === today && !search.trim()
  const selection = live ? groups[view] : tasks
  const shown = technician === null ? selection : selection.filter((task) => task.assignees.some((person) => person.id === technician))
  const title = 'المهام الميدانية'
  const technicians = new Map((options?.technicians ?? []).map((person) => [person.id, person]))
  const names = new Map([...technicians.values()].map((person) => [person.id, person.name]))
  for (const task of tasks) for (const person of task.assignees) names.set(person.id, person.name)
  useDocumentTitle(title)

  return (
    <div className="tasks af-branch-tasks">
      <header className="ph">
        <div><h1>{title}</h1><p className="muted">جهّز المهمة وأرسلها للفني، ثم تابع وقت إنجازها.</p></div>
        {subscriberImport && <div className="ph-actions">{subscriberImport}</div>}
      </header>
      <div className="task-search">
        <Search size={20} aria-hidden="true" />
        <input type="search" value={search} maxLength={80} onChange={(event) => onSearch(event.target.value)}
          placeholder="ابحث برقم المهمة أو المشترك أو الفني أو التفاصيل…" aria-label="بحث عام بالمهام" />
        {search && <button type="button" className="icon-btn" aria-label="مسح البحث" onClick={() => onSearch('')}><X size={18} /></button>}
      </div>
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
      <div className="ph-actions task-actions">
        <Link className="btn tasks-daily-entry" to="/tasks/daily"><Printer size={18} /> كشف إنجاز الفنيين</Link>
        <Link className="btn" to="/tasks?view=archive"><ListChecks size={18} /> أرشيف الفنيين</Link>
        {can(user, 'seals.view') && user.modules?.includes('seals') && <Link className="btn" to="/tasks/seal-work">كشف أعمال الأختام</Link>}
        <Link className="btn" to="/subscriber"><UserRound size={18} /> ملف مشترك</Link>
        {canManage && <>
          <Button icon={<Plus size={18} />} disabled={!options} onClick={() => onNew(false)}>مهمة جديدة</Button>
          <Button className="ph-action" variant="primary" icon={<PhoneIncoming size={18} />} disabled={!options} onClick={() => onNew(true)}>تجهيز مهمة</Button>
        </>}
      </div>
      {(!live || view !== 'waiting') && names.size > 0 && <div className="chips task-filters" role="group" aria-label="الفني">
        <button type="button" className="chip" aria-pressed={technician === null} onClick={() => setTechnician(null)}>الكل</button>
        {[...names.entries()].map(([id, name]) => {
          const n = active.filter((task) => task.assignees.some((person) => person.id === id)).length
          return <button key={id} type="button" className="chip" aria-pressed={technician === id}
            onClick={() => setTechnician(technician === id ? null : id)}>{name}{n > 0 && <span className="chip-count num">{n}</span>}</button>
        })}
      </div>}
      <ErrorBanner text={error} />
      {loading && !tasks.length ? <Loading /> : shown.length ? (
        <section className={live && view === 'waiting' ? 'card prep-card' : undefined}>
          {live && view === 'waiting' && <div className="card-h"><PhoneIncoming size={18} /><h2>مهام مجهزة بانتظار فني</h2></div>}
          <ul className="task-list">{shown.map((task) => <TaskItem key={task.id} task={task} canManage={canManage} onOpen={() => onOpen(task.id)} onChanged={() => onChanged?.()} />)}</ul>
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
        <Pill tone={task.late ? 'danger' : STATUS[task.status].tone}>{task.late ? 'تجاوزت وقتها' : STATUS[task.status].label}</Pill>
        <span className="task-clock num">
          {task.status === 'new' ? 'لم تُرسل بعد' : task.status === 'cancelled' ? 'أُلغيت' : task.status === 'done' ? (duration !== null ? `أُنجزت في ${durationText(duration)}` : 'أُنجزت')
            : duration !== null ? `${durationText(duration)} من ${durationText(task.expected_minutes)}` : ''}
        </span>
      </span>
    </button>
  )
}

/** One task in the list, as in the office's old page: «تم» on its side, transfer and return under it. */
function TaskItem({ task, canManage, onOpen, onChanged }: { task: Task; canManage: boolean; onOpen(): void; onChanged(): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [completing, setCompleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const open = !['done', 'cancelled'].includes(task.status)
  const canReassign = canManage && task.assignees.length > 0 && ['new', 'sent', 'seen'].includes(task.status)

  async function returnToWaiting() {
    if (!(await confirm({ title: `إرجاع المهمة ${task.number} لانتظار فني؟`, message: 'تعود بالرقم والبيانات نفسها، ويُلغى إسنادها إلى الفنيين.', confirmLabel: 'إرجاع' }))) return
    setBusy(true)
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { assignees: [] } })
      toast('أُرجعت المهمة إلى «بانتظار فني»')
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'تعذّر الإرجاع.', 'danger')
    } finally { setBusy(false) }
  }

  return (
    <li className="task-li">
      <div className={`task-card${canReassign ? ' can-reassign' : ''}`}>
        <LegacyTaskRow task={task} onOpen={onOpen} />
        {canReassign && (
          <div className="task-card-actions">
            <button type="button" disabled={busy} className="task-transfer" aria-label={`تحويل المهمة ${task.number} لفني آخر`} onClick={onOpen}><ArrowRightLeft size={14} />تحويل لفني آخر</button>
            <button type="button" disabled={busy} className="task-transfer" aria-label={`إرجاع المهمة ${task.number} لانتظار فني`} onClick={() => void returnToWaiting()}><Undo2 size={14} />{busy ? 'جارٍ الإرجاع…' : 'إرجاع لانتظار فني'}</button>
          </div>
        )}
      </div>
      {canManage && open && task.assignees.length > 0 && (
        <button type="button" className="done-btn" aria-label={`تم إنجاز المهمة ${task.number}`} title="أنجزها الفني: سجّلها منجزة" onClick={() => setCompleting(true)}>
          <CheckCheck size={20} /><span>تم</span><small className="done-more">أنجزها الفني</small>
        </button>
      )}
      {completing && <CompleteDialog task={task} onClose={() => setCompleting(false)} onDone={() => { setCompleting(false); onChanged() }} />}
    </li>
  )
}

function CompleteDialog({ task, onClose, onDone }: { task: Task; onClose(): void; onDone(): void }) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await api(`/tasks/${task.id}/complete`, { method: 'POST', body: { notes: notes.trim() || null } })
      toast(`سُجّلت المهمة ${task.number} منجزة`)
      onDone()
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'تعذّر الحفظ.', 'danger')
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} title={`إنجاز المهمة ${task.number}`} subtitle={task.type?.name}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" icon={<CheckCheck size={18} />} busy={busy} onClick={() => void save()}>تم الإنجاز</Button></>}>
      <div className="form-grid">
        <p className="muted">{task.assignees.length > 1 ? 'مهمة مشتركة: يُسجَّل إنجازها مرة واحدة ويُحسب لكل فني فيها.' : `الفني: ${task.assignees[0]?.name ?? ''}`}</p>
        <label className="field"><span className="label">ما الذي أُنجز؟ (اختياري)</span>
          <textarea className="input textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: بُدّلت الساعة وفُحص الخط" /></label>
      </div>
    </Dialog>
  )
}
