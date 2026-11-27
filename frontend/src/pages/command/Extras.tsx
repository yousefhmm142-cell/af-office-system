import { CalendarDays, FileWarning, GraduationCap, MessageSquareWarning, PartyPopper, StickyNote, Trash2, UserX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { NxAvatar, type Hue } from '../../ui/nx'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import type { CenterData } from './Center'

const KIND: Record<string, string> = { annual: 'سنوية', sick: 'مرضية', other: 'إجازة', permission: 'إذن' }
const wd = (iso: string) => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
const dn = (iso: string) => Number(iso.slice(8, 10))
const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(d)

/* ───────────── the next two weeks: who is away, and holidays ───────────── */
export function TwoWeeks({ data, onPerson }: { data: CenterData; onPerson(id: number): void }) {
  const days = Array.from({ length: 14 }, (_, i) => iso(new Date(Date.now() + i * 864e5)))
  const [pick, setPick] = useState(days[0]!)
  const away = data.calendar.away[pick] ?? []
  const hol = data.calendar.holidays[pick] ?? []
  return (
    <section className="cx-card">
      <header className="cx-h"><span className="cx-h-ico" data-hue="sky"><CalendarDays size={18} /></span><h3>الأسبوعان القادمان</h3><small>الإجازات والعطل</small></header>
      <div className="cx-days">
        {days.map((d, i) => {
          const n = (data.calendar.away[d] ?? []).length
          const h = (data.calendar.holidays[d] ?? []).length > 0
          return (
            <button key={d} type="button" className="cx-day" aria-pressed={pick === d} data-holiday={h || undefined} onClick={() => setPick(d)}>
              <small>{i === 0 ? 'اليوم' : wd(d)}</small><b className="num">{dn(d)}</b>
              <span className="cx-day-dots">{Array.from({ length: Math.min(n, 4) }, (_, k) => <i key={k} />)}</span>
            </button>
          )
        })}
      </div>
      <div className="cx-dayinfo">
        {hol.map((x) => <span key={x.name} className="cx-hol"><PartyPopper size={14} /> {x.name}{x.branch ? ` · ${x.branch}` : ''}</span>)}
        {away.length === 0 && hol.length === 0 && <p className="cx-none">لا أحد في إجازة هذا اليوم.</p>}
        {away.map((p) => <button key={p.user_id} type="button" className="cx-person" onClick={() => onPerson(p.user_id)}><NxAvatar name={p.name} size={28} /><span><b>{p.name}</b><small>{p.branch}</small></span><span className="cx-tag" data-hue={p.kind === 'permission' ? 'violet' : 'sky'}>{KIND[p.kind] ?? p.kind}</span></button>)}
      </div>
    </section>
  )
}

/* ───────────── HR follow-up ───────────── */
export function HrFollow({ data, onPerson }: { data: CenterData; onPerson(id: number): void }) {
  const hr = data.hr
  const [open, setOpen] = useState<'silent' | 'incomplete' | 'trainees' | null>(null)
  if (!hr) return null
  const items: Array<{ key: 'silent' | 'incomplete' | 'trainees'; label: string; hint: string; hue: Hue; icon: ReactNode }> = [
    { key: 'silent', label: 'لم يسجّل حضوراً منذ أسبوع', hint: 'قد يكون ترك العمل أو تعطل جواله', hue: 'rose', icon: <UserX size={16} /> },
    { key: 'incomplete', label: 'ملفات شخصية ناقصة', hint: 'لم يُدخل بياناته أو مرفقاته', hue: 'amber', icon: <FileWarning size={16} /> },
    { key: 'trainees', label: 'متدربون', hint: 'راجع تثبيتهم عند انتهاء التدريب', hue: 'sky', icon: <GraduationCap size={16} /> },
  ]
  return (
    <section className="cx-card">
      <header className="cx-h"><span className="cx-h-ico" data-hue="violet"><MessageSquareWarning size={18} /></span><h3>متابعة شؤون الموظفين</h3></header>
      <div className="cx-follow">
        {items.map((it) => {
          const g = hr[it.key]
          return (
            <div key={it.key} className="cx-follow-i" data-hue={it.hue} data-open={open === it.key || undefined}>
              <button type="button" onClick={() => setOpen(open === it.key ? null : it.key)} disabled={!g.count}>
                <span className="cx-follow-ico">{it.icon}</span>
                <span className="cx-follow-t"><b>{it.label}</b><small>{it.hint}</small></span>
                <b className="cx-follow-n num">{g.count}</b>
              </button>
              {open === it.key && <div className="cx-follow-list">{g.people.map((p) => <button key={p.user_id} type="button" className="cx-person" onClick={() => onPerson(p.user_id)}><NxAvatar name={p.name} size={28} /><span><b>{p.name}</b><small>{p.branch}</small></span></button>)}{g.count > g.people.length && <small className="cx-none">و{g.count - g.people.length} آخرون…</small>}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ───────────── notes, praise and warnings on a person (in the quick file) ───────────── */
type Note = { id: number; kind: 'note' | 'praise' | 'warning'; body: string; created_at: string; by: string | null; created_by: number | null }
const NOTE: Record<Note['kind'], { label: string; hue: Hue; icon: ReactNode }> = {
  note: { label: 'ملاحظة', hue: 'slate', icon: <StickyNote size={15} /> },
  praise: { label: 'إشادة', hue: 'mint', icon: <PartyPopper size={15} /> },
  warning: { label: 'تنبيه رسمي', hue: 'rose', icon: <MessageSquareWarning size={15} /> },
}
export function NotesTab({ userId, canWrite }: { userId: number; canWrite: boolean }) {
  const me = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, reload } = useLoad<{ notes: Note[] }>(`/employees/${userId}/notes`)
  const [kind, setKind] = useState<Note['kind']>('note')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (kind === 'warning' && !(await confirm({ title: 'تسجيل تنبيه رسمي؟', message: 'يبقى في ملف الموظف، ويظهر لمن يطّلع على ملفه.', confirmLabel: 'تسجيل', danger: true }))) return
    setBusy(true)
    try { await api(`/employees/${userId}/notes`, { method: 'POST', body: { kind, body } }); setBody(''); toast('سُجّلت'); void reload() }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ.', 'danger') } finally { setBusy(false) }
  }
  return <div className="pd-list">
    {canWrite && <div className="pd-sheet pd-note-new">
      <div className="pd-adj-types">{(Object.keys(NOTE) as Note['kind'][]).map((k) => <button key={k} type="button" data-hue={NOTE[k].hue} aria-pressed={kind === k} onClick={() => setKind(k)}>{NOTE[k].icon} {NOTE[k].label}</button>)}</div>
      <textarea className="input textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'warning' ? 'سبب التنبيه بوضوح…' : kind === 'praise' ? 'على ماذا يستحق الإشادة؟' : 'ملاحظة إدارية…'} />
      <div className="pd-sheet-bar"><Button variant="primary" className="sm" busy={busy} disabled={body.trim().length < 3} onClick={() => void add()}>حفظ</Button></div>
    </div>}
    {(data?.notes ?? []).map((n) => (
      <div key={n.id} className="pd-note" data-hue={NOTE[n.kind].hue}>
        <span className="pd-note-i">{NOTE[n.kind].icon}</span>
        <div><b>{NOTE[n.kind].label}</b><p>{n.body}</p><small>{n.by ?? '—'} · {new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(n.created_at.replace(' ', 'T')))}</small></div>
        {n.created_by === me.id && <button type="button" className="nx-icon-btn" aria-label="حذف" onClick={async () => { if (await confirm({ title: 'حذف الملاحظة؟', danger: true, confirmLabel: 'حذف' })) { await api(`/employees/${userId}/notes/${n.id}`, { method: 'DELETE' }).catch(() => undefined); void reload() } }}><Trash2 size={15} /></button>}
      </div>
    ))}
    {data && data.notes.length === 0 && <p className="pd-empty">لا ملاحظات بعد.</p>}
  </div>
}
