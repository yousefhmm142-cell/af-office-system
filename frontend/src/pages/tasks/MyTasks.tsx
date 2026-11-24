import { Camera, CheckCircle2, ClipboardList, CloudOff, MapPin, Phone, Play } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api, ApiError } from '../../api/client'
import { flushActions, onActionsChange, queuedActions, sendOrQueue } from '../../lib/actionQueue'
import { useOnline } from '../../lib/useOnline'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { PRIORITY, STATUS, durationText, timeOf, useMinutesSince, type Task } from './lib'

const CACHE = 'af-my-tasks'

/** A technician's tasks: big cards, two buttons, works without internet. */
export function MyTasks() {
  const online = useOnline()
  const { data: live, reload } = useLoad<{ tasks: Task[]; new: number }>('/tasks/mine')
  const pending = useSyncExternalStore(onActionsChange, () => queuedActions().length)
  const [local, setLocal] = useState<Record<number, Partial<Task>>>({})
  const [finishing, setFinishing] = useState<Task | null>(null)

  useEffect(() => { if (live) { try { localStorage.setItem(CACHE, JSON.stringify(live)) } catch { /* not kept */ } setLocal({}) } }, [live])
  useEffect(() => { if (online && pending === 0) void reload() }, [online, pending, reload])
  useEffect(() => { const id = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void reload() }, 60_000); return () => window.clearInterval(id) }, [reload])

  let data = live
  if (!data) try { data = JSON.parse(localStorage.getItem(CACHE) ?? 'null') } catch { data = null }
  if (!data) return <Loading />
  const tasks = data.tasks.map((t) => ({ ...t, ...local[t.id] }))
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const doneToday = tasks.filter((t) => t.status === 'done')

  return (
    <>
      <PageHead title="مهامي" eyebrow={openTasks.length ? `لديك ${openTasks.length} ${openTasks.length === 1 ? 'مهمة' : 'مهام'}` : 'لا توجد مهام الآن'} />
      {pending > 0 && <div className="banner info af-mb"><CloudOff size={18} /><p>{pending} عملية محفوظة على جوالك، وستُرسل تلقائياً عند عودة الإنترنت.{online && <button type="button" className="link-btn" onClick={() => void flushActions()}> أرسل الآن</button>}</p></div>}
      {openTasks.length === 0 && (
        <section className="card glass af-empty-hero"><span className="af-empty-ico"><ClipboardList size={34} /></span><h2>لا توجد مهام مفتوحة</h2><p className="eyebrow">ستظهر هنا المهام التي يرسلها لك المكتب.</p></section>
      )}
      <div className="af-my-tasks">
        {openTasks.map((t) => <MyTaskCard key={t.id} t={t} onLocal={(p) => setLocal((l) => ({ ...l, [t.id]: { ...l[t.id], ...p } }))} onFinish={() => setFinishing(t)} />)}
      </div>
      {doneToday.length > 0 && (
        <section className="card glass af-pad" style={{ marginTop: 16 }}>
          <h2 className="af-h2"><CheckCircle2 size={18} /> أنجزتها اليوم ({doneToday.length})</h2>
          <div className="rows">{doneToday.map((t) => <div key={t.id} className="row"><span className="row-label">#{t.number} · {t.type?.name}<small className="af-sub">{t.subscriber_name ?? ''}</small></span><span className="row-value num">{timeOf(t.completed_at)}</span></div>)}</div>
        </section>
      )}
      {finishing && <FinishDialog t={finishing} onClose={() => setFinishing(null)} onDone={(p) => { setLocal((l) => ({ ...l, [finishing.id]: p })); setFinishing(null) }} />}
    </>
  )
}

function MyTaskCard({ t, onLocal, onFinish }: { t: Task; onLocal(p: Partial<Task>): void; onFinish(): void }) {
  const toast = useToast()
  const since = useMinutesSince(t.started_at)
  const [busy, setBusy] = useState(false)
  const shared = t.assignees.length > 1

  useEffect(() => {
    // Opening the page counts as «the technician has seen it».
    if (t.status === 'sent' && navigator.onLine) void api(`/tasks/${t.id}/seen`, { method: 'POST' }).catch(() => undefined)
  }, [t.id, t.status])

  async function start() {
    setBusy(true)
    try {
      const res = await sendOrQueue<{ task: Task }>(`/tasks/${t.id}/start`, {}, `بدء المهمة ${t.number}`)
      onLocal(res?.task ?? { status: 'in_progress', started_at: new Date().toISOString() })
      toast(res ? 'بدأ العمل على المهمة' : 'حُفظ على جوالك وسيُرسل عند عودة الإنترنت')
    } catch (e) { toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.', 'danger') } finally { setBusy(false) }
  }

  return (
    <article className="card glass af-my-task" data-p={t.priority}>
      <header>
        <span className="af-my-num num">#{t.number}</span>
        <span className="af-my-title"><b>{t.type?.name}</b><small>{STATUS[t.status].label}{t.priority !== 'normal' ? ` · ${PRIORITY[t.priority].label}` : ''}</small></span>
        {t.priority !== 'normal' && <Pill tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Pill>}
      </header>
      {t.details && <p className="af-task-details">{t.details}</p>}
      <div className="af-my-info">
        {t.subscriber_name && <span><b>{t.subscriber_name}</b></span>}
        {t.subscriber_phone && <a className="af-call num" href={`tel:${t.subscriber_phone}`} dir="ltr"><Phone size={16} /> {t.subscriber_phone}</a>}
        {(t.zone || t.location_text) && <span><MapPin size={15} /> {[t.zone?.name, t.location_text].filter(Boolean).join(' · ')}</span>}
        <span className="af-sub">المدة المتوقعة {durationText(t.expected_minutes)}{since !== null ? ` · مضى ${durationText(since)}` : ''}{shared ? ' · مهمة مشتركة' : ''}</span>
      </div>
      {t.status === 'in_progress' ? (
        shared ? <p className="af-explain">مهمة مشتركة: يسجّل المكتب إنجازها عند الانتهاء.</p>
          : <Button variant="primary" size="lg" block icon={<CheckCircle2 size={22} />} onClick={onFinish}>أنجزت المهمة</Button>
      ) : (
        <Button variant="primary" size="lg" block icon={<Play size={22} />} busy={busy} onClick={() => void start()}>بدأت العمل</Button>
      )}
    </article>
  )
}

function FinishDialog({ t, onClose, onDone }: { t: Task; onClose(): void; onDone(p: Partial<Task>): void }) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const cam = useRef<HTMLInputElement>(null)

  async function finish() {
    setBusy(true)
    try {
      if (photo && navigator.onLine) {
        const form = new FormData()
        form.append('notes', notes)
        form.append('photo', photo)
        form.append('operation', crypto.randomUUID())
        const res = await api<{ task: Task }>(`/tasks/${t.id}/complete`, { method: 'POST', body: form })
        onDone(res.task)
        toast('أحسنت! سُجّل إنجاز المهمة')
        return
      }
      const res = await sendOrQueue<{ task: Task }>(`/tasks/${t.id}/complete`, { notes: notes.trim() || null }, `إنجاز المهمة ${t.number}`)
      onDone(res?.task ?? { status: 'done', completed_at: new Date().toISOString() })
      toast(res ? 'أحسنت! سُجّل إنجاز المهمة' : 'حُفظ الإنجاز على جوالك وسيُرسل عند عودة الإنترنت')
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.', 'danger')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={`إنجاز المهمة #${t.number}`} subtitle={t.type?.name} icon={<CheckCircle2 size={20} />}
      footer={<Button variant="primary" size="lg" block busy={busy} icon={<CheckCircle2 size={20} />} onClick={() => void finish()}>تأكيد الإنجاز</Button>}>
      <div className="form-grid">
        <label className="af-inline">ماذا عملت؟ (اختياري)
          <textarea className="input textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: بُدّلت الساعة وفُحص الخط" />
        </label>
        <Button icon={<Camera size={18} />} onClick={() => cam.current?.click()}>{photo ? 'تغيير الصورة' : 'صورة (اختياري)'}</Button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        {photo && <img className="af-photo-preview" src={URL.createObjectURL(photo)} alt="الصورة المرفقة" />}
        {photo && !navigator.onLine && <p className="af-late">الصورة تحتاج إلى إنترنت. سيُحفظ الإنجاز دونها.</p>}
      </div>
    </Dialog>
  )
}
