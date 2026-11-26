import { ChoiceField } from '../../ui/ChoiceField'
import { ChevronLeft, ChevronRight, ClipboardPlus, Clock, MapPin, Search, Settings2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Branch } from '../../api/types'
import { scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
import { TaskArchive } from './TaskArchive'
import { BranchTasks, type BranchTaskView } from './BranchTasks'
import { SubscriberImport } from './SubscriberImport'
import { NewTask } from './NewTask'
import { TaskSheet } from './TaskSheet'
import { PRIORITY, durationText, useMinutesSince, type Options, type Task } from './lib'

const todayGaza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())
const shiftDay = (d: string, by: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + by); return x.toISOString().slice(0, 10) }
const dayLabel = (d: string) => (d === todayGaza() ? 'اليوم' : new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)))

const COLUMNS: Array<{ key: string; label: string; match: (t: Task) => boolean }> = [
  { key: 'new', label: 'لم تُرسل', match: (t) => t.status === 'new' },
  { key: 'sent', label: 'عند الفني', match: (t) => t.status === 'sent' || t.status === 'seen' },
  { key: 'work', label: 'قيد التنفيذ', match: (t) => t.status === 'in_progress' },
  { key: 'done', label: 'أُنجزت أو أُلغيت', match: (t) => t.status === 'done' || t.status === 'cancelled' },
]

/** The office's day of tasks, in four columns, with a timer on every open task. */
export function TasksBoard() {
  const me = useUser()
  const manager = me.role?.key === 'branch_manager'
  const all = scopeOf(me, 'tasks.view') === 'all' || scopeOf(me, 'tasks.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [branchId, setBranchId] = useState<string>(all && !manager && scopeOf(me,'tasks.view')==='all' ? new URLSearchParams(location.search).get('branch_id') || 'all' : String(me.branch?.id ?? ''))
  const chosen = branchId || (all ? String(branches.data?.branches[0]?.id ?? '') : '')
  const [day, setDay] = useState(todayGaza)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const archive = manager && params.get('view') === 'archive'
  const { data: taskData, error, loading, reload } = useLoad<{ branch_id: number | null; tasks: Task[]; can_manage: boolean }>(chosen && !archive ? `/tasks?${chosen==='all'?'all_branches=1':'branch_id='+chosen}&day=${day}${q ? `&search=${encodeURIComponent(q)}` : ''}` : null)
  const data = taskData && String(taskData.branch_id ?? 'all') === chosen ? taskData : null
  const branchName = branches.data?.branches.find((branch) => String(branch.id) === chosen)?.name ?? me.branch?.name
  const subscriberImport = data?.can_manage && chosen
    ? <SubscriberImport key={chosen} branchId={chosen} branchName={branchName} /> : null
  const options = useLoad<Options>(chosen && chosen!=='all' ? `/tasks/options?branch_id=${chosen}` : null)
  const preparing = manager && params.get('new') === 'prepare'
  const status = params.get('status')
  const managerView: BranchTaskView = status === 'waiting' || status === 'late' || status === 'done' ? status : 'assigned'
  const creating = params.get('new') === '1' || preparing
  function setCreating(open: boolean, prepare = false) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (open) next.set('new', prepare ? 'prepare' : '1')
      else next.delete('new')
      return next
    }, { replace: true })
  }
  // A task opened from the global search (?open=ID), on whatever day it was made.
  const [open, setOpen] = useState<number | null>(() => Number(params.get('open')) || null)

  useEffect(() => { const t = window.setTimeout(() => setQ(search.trim()), 300); return () => window.clearTimeout(t) }, [search])
  useEffect(() => { const id = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 30_000); return () => window.clearInterval(id) }, [reload])

  const tasks = data?.tasks ?? []
  const late = tasks.filter((t) => t.late).length
  const openCount = tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length
  const done = tasks.filter((t) => t.status === 'done').length
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, tasks: tasks.filter(c.match) })), [tasks])

  if (manager) return (
    <>
      {archive ? <TaskArchive branch={chosen} branchName={me.branch?.name} options={options.data} today={todayGaza()} onOpen={setOpen} /> : <BranchTasks view={managerView} tasks={tasks} options={options.data} day={day} today={todayGaza()} search={search}
        canManage={data?.can_manage ?? false} subscriberImport={subscriberImport} loading={loading} error={error}
        onView={(view) => setParams((current) => { const next = new URLSearchParams(current); next.set('status', view); return next }, { replace: true })}
        onSearch={setSearch} onDay={setDay} onStep={(amount) => setDay(shiftDay(day, amount))}
        onOpen={setOpen} onNew={(prepare) => setCreating(true, prepare)} onChanged={() => { void reload(); void options.reload() }} />}
      {creating && data?.can_manage && options.data && String(options.data.branch_id) === chosen && <NewTask branchStyle prepare={preparing} options={options.data}
        onClose={() => setCreating(false)}
        onSaved={(task, keepOpen) => {
          if (keepOpen) {
            void reload()
            void options.reload()
            return
          }
          if (preparing) {
            setParams((current) => {
              const next = new URLSearchParams(current)
              next.delete('new')
              next.set('status', 'waiting')
              return next
            }, { replace: true })
            setSearch('')
            setQ('')
            setDay(todayGaza())
          } else {
            setCreating(false)
            setOpen(task.id)
          }
          void reload()
          void options.reload()
        }} />}
      {open && <TaskSheet id={open} options={options.data} onClose={() => setOpen(null)} onChanged={() => { void reload(); void options.reload() }} />}
    </>
  )

  return (
    <>
      <PageHead title="المهام الميدانية" eyebrow={dayLabel(day)}
        actions={data && (
          <>
            {subscriberImport}
            <Link to="/tasks/daily" className="btn">كشف إنجاز الفنيين</Link>
            {data.can_manage && <Link to={`/tasks/settings?branch_id=${chosen}`} className="btn"><Settings2 size={18} /> الأنواع والمناطق</Link>}
            {data.can_manage && <Button variant="primary" size="lg" icon={<ClipboardPlus size={20} />} disabled={!options.data} onClick={() => setCreating(true)}>مهمة جديدة</Button>}
          </>
        )} />

      <div className="af-toolbar">
        {all && (
          <ChoiceField className="input select" value={chosen} onChange={(e) => setBranchId(e.target.value)} aria-label="الفرع">
            {scopeOf(me,'tasks.view')==='all' && <option value="all">كل الفروع</option>}
            {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </ChoiceField>
        )}
        <div className="af-daynav af-admin-daynav">
          <button type="button" className="icon-btn" aria-label="اليوم السابق" onClick={() => setDay(shiftDay(day, -1))}><ChevronRight size={18} /></button>
          <input className="input" type="date" aria-label="تاريخ المهام" value={day} max={todayGaza()} onChange={e=>{if(e.target.value && e.target.value<=todayGaza())setDay(e.target.value)}}/>
          <button type="button" className="chip" aria-pressed={day === todayGaza()} onClick={() => setDay(todayGaza())}>اليوم</button>
          <button type="button" className="icon-btn" aria-label="اليوم التالي" disabled={day >= todayGaza()} onClick={() => setDay(shiftDay(day, 1))}><ChevronLeft size={18} /></button>
        </div>
        <div className="af-search"><Search size={17} aria-hidden="true" /><input className="input" placeholder="ابحث برقم المهمة أو المشترك أو الفني" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث" /></div>
      </div>

      <div className="dash-kpis">
        <div className="dash-kpi glass"><span className="dash-kpi-l">مفتوحة</span><span className="dash-kpi-n num">{openCount}</span></div>
        <div className="dash-kpi glass" data-tone="danger"><span className="dash-kpi-l">متأخرة</span><span className="dash-kpi-n num">{late}</span></div>
        <div className="dash-kpi glass" data-tone="ok"><span className="dash-kpi-l">أُنجزت</span><span className="dash-kpi-n num">{done}</span></div>
        {chosen!=='all' && <div className="dash-kpi glass" data-tone="info"><span className="dash-kpi-l">الفنيون المتفرّغون</span><span className="dash-kpi-n num">{options.data?.technicians.filter((x) => x.open === 0).length ?? '…'}</span></div>}
      </div>

      {chosen==='all' && data && <section className="card af-pad"><h2 className="af-h2">الأداء حسب الفرع</h2><div className="af-branch-grid">{branches.data?.branches.map(b=>{
        const list=tasks.filter(t=>t.branch_id===b.id)
        return <button className="af-branch-today" type="button" key={b.id} onClick={()=>setBranchId(String(b.id))}><b>{b.name}</b><p>{list.filter(t=>t.status==='done').length} منجزة · {list.filter(t=>t.late).length} متأخرة · {list.length} إجمالاً</p></button>
      })}</div></section>}
      <ErrorBanner text={error ?? branches.error} />
      {loading && !data ? <Loading /> : (
        <div className="af-board">
          {columns.map((c) => (
            <section key={c.key} className="af-col" data-col={c.key}>
              <header><b>{c.label}</b><span className="af-count num">{c.tasks.length}</span></header>
              <div className="af-col-list">
                {c.tasks.map((t) => <TaskCard key={t.id} t={t} onOpen={() => {if(chosen==='all')setBranchId(String(t.branch_id));setOpen(t.id)}} />)}
                {c.tasks.length === 0 && <p className="af-col-empty">لا شيء هنا</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {creating && data?.can_manage && options.data && String(options.data.branch_id) === chosen && <NewTask options={options.data} onClose={() => setCreating(false)} onSaved={(t) => { setCreating(false); void reload(); void options.reload(); setOpen(t.id) }} />}
      {open && <TaskSheet id={open} options={options.data} onClose={() => setOpen(null)} onChanged={() => { void reload(); void options.reload() }} />}
    </>
  )
}

function TaskCard({ t, onOpen }: { t: Task; onOpen(): void }) {
  const since = useMinutesSince(t.started_at ?? t.sent_at)
  const openTask = !['done', 'cancelled'].includes(t.status)
  const pct = since !== null && openTask ? Math.min(100, Math.round((since / t.expected_minutes) * 100)) : null
  return (
    <button type="button" className="af-task" data-p={t.priority} data-late={t.late || undefined} data-status={t.status} onClick={onOpen}>
      <span className="af-task-top">
        <b className="num">#{t.number}</b>
        <span className="af-task-type">{t.type?.name}</span>
        {t.priority !== 'normal' && <Pill tone={PRIORITY[t.priority].tone} dot={false}>{PRIORITY[t.priority].label}</Pill>}
      </span>
      {(t.subscriber_name || t.zone || t.location_text) && (
        <span className="af-task-where">{t.subscriber_name}{t.subscriber_name && (t.zone || t.location_text) ? ' · ' : ''}{(t.zone || t.location_text) && <><MapPin size={13} /> {[t.zone?.name, t.location_text].filter(Boolean).join('، ')}</>}</span>
      )}
      <span className="af-task-bottom">
        <span className="af-task-people">
          {t.assignees.length === 0 ? <small className="af-missing"><Users size={13} /> بلا فني</small> : t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} size={26} />)}
          {t.assignees.length === 1 && <small>{t.assignees[0]!.name}</small>}
          {t.assignees.length > 1 && <small>{t.assignees.length} فنيين</small>}
        </span>
        {openTask && since !== null ? (
          <span className="af-timer num" data-late={t.late || undefined}><Clock size={13} /> {durationText(since)} / {durationText(t.expected_minutes)}</span>
        ) : t.status === 'done' && t.actual_minutes !== null ? <span className="af-timer num"><Clock size={13} /> {durationText(t.actual_minutes)}</span> : null}
      </span>
      {pct !== null && <span className="af-task-bar"><i style={{ width: `${pct}%` }} data-late={t.late || undefined} /></span>}
    </button>
  )
}
