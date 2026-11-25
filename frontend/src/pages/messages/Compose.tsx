import { CalendarDays, Clock, Paperclip, Send, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Avatar, Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { KIND, type Full, type Group, type Kind, type Recipient } from './lib'

export interface Draft {
  kind: Kind
  to?: Array<{ id: number; name: string }>
  subject?: string
  body?: string
  replyTo?: number
  forwardOf?: Full
}

/** Writing a message: pick people (or a group), write, send. Leave and permission requests have their own fields. */
export function Compose({ draft, onClose, onSent }: { draft: Draft; onClose(): void; onSent(): void }) {
  const toast = useToast()
  const { data } = useLoad<{ people: Recipient[]; groups: Group[] }>('/messages/recipients')
  const [kind,setKind] = useState(draft.kind)
  const [to, setTo] = useState(draft.to ?? [])
  const [groups, setGroups] = useState<Group[]>([])
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState(draft.subject ?? (draft.kind === 'leave_request' ? 'طلب إجازة' : draft.kind === 'permission_request' ? 'طلب إذن' : ''))
  const [body, setBody] = useState(draft.body ?? '')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [date, setDate] = useState('')
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const people = data?.people ?? []
  const hr = people.filter((p) => p.role_key === 'hr')
  const managers = people.filter((p) => p.role_key === 'branch_manager')
  const suggestions = useMemo(() => {
    const s = q.trim()
    return people.filter((p) => !to.some((t) => t.id === p.id) && (!s || p.name.includes(s))).slice(0, s ? 30 : 8)
  }, [people, q, to])

  const title = draft.forwardOf ? 'رفع (تحويل) رسالة' : draft.replyTo ? 'رد' : draft.kind === 'leave_request' ? 'طلب إجازة' : draft.kind === 'permission_request' ? 'طلب إذن' : 'رسالة جديدة'

  async function send() {
    setBusy(true); setError(null)
    const form = new FormData()
    to.forEach((t) => form.append('to[]', String(t.id)))
    groups.forEach((g, i) => { form.append(`groups[${i}][type]`, g.type); if (g.id) form.append(`groups[${i}][id]`, String(g.id)) })
    form.append('subject', subject.trim())
    form.append('body', body.trim() || (draft.kind !== 'message' ? subject : ''))
    form.append('kind', kind)
    if (draft.kind === 'leave_request') { if (from) form.append('meta[from]', from); if (until) form.append('meta[to]', until) }
    if (draft.kind === 'permission_request') { if (date) form.append('meta[date]', date); if (fromTime) form.append('meta[from_time]', fromTime); if (toTime) form.append('meta[to_time]', toTime) }
    if (draft.replyTo) form.append('reply_to', String(draft.replyTo))
    if (draft.forwardOf) form.append('forward_of', String(draft.forwardOf.id))
    files.forEach((f) => form.append('files[]', f))
    try {
      await api('/messages', { method: 'POST', body: form })
      toast('أُرسلت الرسالة')
      onSent()
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'تعذّر الإرسال.')
    } finally { setBusy(false) }
  }

  const ready = (to.length > 0 || groups.length > 0) && subject.trim() && (body.trim() || draft.kind !== 'message')

  return (
    <Dialog open onClose={onClose} title={title} icon={<Send size={20} />} className="af-compose"
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" size="lg" icon={<Send size={18} />} busy={busy} disabled={!ready} onClick={() => void send()}>إرسال</Button></>}>
      <div className="form-grid">
        <div className="field">
          <label>إلى</label>
          <div className="af-to">
            {to.map((t) => <span key={t.id} className="af-chip-person"><Avatar name={t.name} size={24} />{t.name}<button type="button" aria-label={`إزالة ${t.name}`} onClick={() => setTo(to.filter((x) => x.id !== t.id))}><X size={14} /></button></span>)}
            {groups.map((g) => <span key={`${g.type}${g.id}`} className="af-chip-person group"><Users size={16} />{g.name}<button type="button" aria-label={`إزالة ${g.name}`} onClick={() => setGroups(groups.filter((x) => x !== g))}><X size={14} /></button></span>)}
            <input className="af-to-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={to.length || groups.length ? 'أضف آخر…' : 'اكتب اسماً…'} aria-label="ابحث عن مستلم" />
          </div>
          {!draft.replyTo && to.length === 0 && groups.length === 0 && !q && (hr.length > 0 || managers.length > 0) && (
            <div className="chips af-quick-to">
              {managers.slice(0, 2).map((p) => <button key={p.id} type="button" className="chip" onClick={() => setTo([...to, p])}>مدير الفرع: {p.name}</button>)}
              {hr.slice(0, 2).map((p) => <button key={p.id} type="button" className="chip" onClick={() => setTo([...to, p])}>شؤون الموظفين: {p.name}</button>)}
            </div>
          )}
          {(q || (to.length === 0 && groups.length === 0)) && (
            <div className="af-suggest">
              {suggestions.map((p) => (
                <button key={p.id} type="button" className="af-picker-row" onClick={() => { setTo([...to, p]); setQ('') }}>
                  <Avatar name={p.name} size={30} /><span><b>{p.name}</b><small>{[p.job_title ?? p.role, p.branch].filter(Boolean).join(' · ')}</small></span>
                </button>
              ))}
              {data?.groups.filter((g) => !q || g.name.includes(q)).slice(0, 6).map((g) => (
                <button key={`${g.type}${g.id}`} type="button" className="af-picker-row" onClick={() => { if (!groups.includes(g)) setGroups([...groups, g]); setQ('') }}>
                  <span className="af-group-ico"><Users size={16} /></span><span><b>{g.name}</b><small>مجموعة</small></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {draft.kind === 'leave_request' && (
          <div className="af-row2">
            <Field label="من تاريخ">{(id) => <input id={id} className="input num" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
            <Field label="إلى تاريخ">{(id) => <input id={id} className="input num" type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} />}</Field>
          </div>
        )}
        {draft.kind === 'permission_request' && (
          <div className="af-row3">
            <Field label="اليوم">{(id) => <input id={id} className="input num" type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="من الساعة">{(id) => <input id={id} className="input num" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />}</Field>
            <Field label="إلى الساعة">{(id) => <input id={id} className="input num" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />}</Field>
          </div>
        )}

        {!draft.replyTo && !draft.forwardOf && <label>التصنيف<select className="input select" value={kind} onChange={e=>setKind(e.target.value as Kind)}>
          {(['message','fault','collection','circular'] as const).map(k=><option key={k} value={k}>{KIND[k].label}</option>)}</select></label>}
        <Field label="الموضوع">{(id) => <input id={id} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
        <Field label={draft.kind === 'message' ? 'نص الرسالة' : 'السبب أو التفاصيل'}>
          {(id) => <textarea id={id} className="input textarea af-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={draft.kind === 'leave_request' ? 'مثال: ظرف عائلي' : draft.kind === 'permission_request' ? 'مثال: موعد طبيب' : 'اكتب رسالتك…'} />}
        </Field>
        {draft.forwardOf && <div className="af-quote"><small>الرسالة المرفوعة من {draft.forwardOf.sender?.name}:</small><b>{draft.forwardOf.subject}</b><p>{draft.forwardOf.body.slice(0, 300)}</p></div>}

        <div className="af-files">
          <Button icon={<Paperclip size={16} />} onClick={() => fileRef.current?.click()} disabled={files.length >= 5}>إرفاق ملف</Button>
          <input ref={fileRef} type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.target.value = '' }} />
          {files.map((f, i) => <span key={i} className="af-chip-person">{f.name}<button type="button" aria-label={`إزالة ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))}><X size={14} /></button></span>)}
        </div>
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}

export function KindIcon({ kind }: { kind: Kind }) {
  return kind === 'leave_request' ? <CalendarDays size={16} /> : kind === 'permission_request' ? <Clock size={16} /> : null
}
