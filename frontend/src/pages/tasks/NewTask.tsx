import { ClipboardPlus, MessageCircle, Save, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Avatar, Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { MINUTES, PRIORITY, durationText, whatsappText, whatsappUrl, type Options, type Priority, type Task } from './lib'

/**
 * A new task in a few taps: what (type), who (technicians), for whom (subscriber), where, how urgent,
 * how long. Then «send by WhatsApp», «send in the app», or just keep it for later.
 */
export function NewTask({ options, onClose, onSaved }: { options: Options; onClose(): void; onSaved(t: Task): void }) {
  const toast = useToast()
  const types = options.types.filter((t) => t.is_active)
  const [typeId, setTypeId] = useState<number | null>(null)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [techs, setTechs] = useState<number[]>([])
  const [subscriber, setSubscriber] = useState('')
  const [phone, setPhone] = useState('')
  const [zoneId, setZoneId] = useState<number | null>(null)
  const [place, setPlace] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [minutes, setMinutes] = useState(60)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const shownTypes = showAllTypes ? types : types.slice(0, 10)
  const technicians = useMemo(() => [...options.technicians].sort((a, b) => a.open - b.open || a.name.localeCompare(b.name, 'ar')), [options])

  async function save(send: 'whatsapp' | 'app' | null) {
    if (!typeId) return setFields({ task_type_id: 'اختر نوع المهمة.' })
    setBusy(send ?? 'save'); setFields({}); setError(null)
    try {
      const res = await api<{ task: Task }>('/tasks', {
        method: 'POST',
        body: {
          branch_id: options.branch_id, task_type_id: typeId, assignees: techs, subscriber_name: subscriber.trim() || null,
          subscriber_phone: phone.trim() || null, zone_id: zoneId, location_text: place.trim() || null, priority,
          expected_minutes: minutes, details: details.trim() || null, send,
        },
      })
      if (send === 'whatsapp') {
        const text = whatsappText(res.task)
        const first = res.task.assignees.find((a) => a.phone)
        if (first?.phone) window.open(whatsappUrl(first.phone, text, first.wa_code), '_blank')
        else toast('لا يوجد رقم جوال للفني في ملفه؛ أرسلها من صفحة المهمة.', 'danger')
      }
      toast(send ? `أُرسلت المهمة رقم ${res.task.number}` : `حُفظت المهمة رقم ${res.task.number}`)
      onSaved(res.task)
    } catch (e) {
      if (e instanceof ApiError) { setFields(e.fields); setError(Object.keys(e.fields).length ? null : e.message) }
    } finally { setBusy(null) }
  }

  return (
    <Dialog open onClose={onClose} title="مهمة جديدة" icon={<ClipboardPlus size={20} />} className="af-compose"
      footer={
        <div className="af-task-foot">
          <Button variant="primary" size="lg" icon={<MessageCircle size={18} />} busy={busy === 'whatsapp'} disabled={!typeId || techs.length === 0} onClick={() => void save('whatsapp')}>حفظ وإرسال واتساب</Button>
          <Button icon={<Send size={18} />} busy={busy === 'app'} disabled={!typeId || techs.length === 0} onClick={() => void save('app')}>إرسال داخل النظام</Button>
          <Button variant="ghost" icon={<Save size={18} />} busy={busy === 'save'} disabled={!typeId} onClick={() => void save(null)}>حفظ دون إرسال</Button>
        </div>
      }>
      <div className="form-grid">
        <div className="field">
          <label>نوع المهمة</label>
          <div className="chips">
            {shownTypes.map((t) => <button key={t.id} type="button" className="chip" aria-pressed={typeId === t.id} onClick={() => { setTypeId(t.id); setMinutes(t.default_minutes) }}>{t.name}</button>)}
            {!showAllTypes && types.length > 10 && <button type="button" className="chip" onClick={() => setShowAllTypes(true)}>المزيد…</button>}
          </div>
          {fields.task_type_id && <span className="field-error">{fields.task_type_id}</span>}
        </div>

        <div className="field">
          <label>الفني <small className="af-sub" style={{ display: 'inline' }}>(اختر أكثر من فني لمهمة مشتركة، أو اتركه فارغاً لتحضير المهمة)</small></label>
          <div className="af-techs">
            {technicians.map((t) => (
              <button key={t.id} type="button" className="af-tech" aria-pressed={techs.includes(t.id)} onClick={() => setTechs(techs.includes(t.id) ? techs.filter((x) => x !== t.id) : [...techs, t.id])}>
                <Avatar name={t.name} size={34} />
                <span><b>{t.name}</b><small>{t.job_title ?? t.department ?? ''}{t.open ? ` · ${t.open} مفتوحة` : ' · متفرّغ'}</small></span>
              </button>
            ))}
          </div>
          {fields.assignees && <span className="field-error">{fields.assignees}</span>}
        </div>

        <div className="af-row2">
          <Field label="المشترك (اختياري)" error={fields.subscriber_name}>{(id) => <input id={id} className="input" value={subscriber} onChange={(e) => setSubscriber(e.target.value)} />}</Field>
          <Field label="جوال المشترك" error={fields.subscriber_phone}>{(id) => <input id={id} className="input num" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />}</Field>
        </div>

        {options.zones.some((z) => z.is_active) && (
          <div className="field">
            <label>المنطقة</label>
            <div className="chips">
              {options.zones.filter((z) => z.is_active).map((z) => <button key={z.id} type="button" className="chip" aria-pressed={zoneId === z.id} onClick={() => setZoneId(zoneId === z.id ? null : z.id)}>{z.name}</button>)}
            </div>
          </div>
        )}
        <Field label="وصف المكان" error={fields.location_text}>{(id) => <input id={id} className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="مثال: قرب المسجد، الطابق الثاني" />}</Field>

        <div className="af-row2">
          <div className="field">
            <label>الأولوية</label>
            <div className="segmented af-prio" role="radiogroup" aria-label="الأولوية">
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <button key={p} type="button" role="radio" data-p={p} aria-checked={priority === p} onClick={() => setPriority(p)}>{PRIORITY[p].label}</button>)}
            </div>
          </div>
          <div className="field">
            <label>المدة المتوقعة: <b>{durationText(minutes)}</b></label>
            <div className="chips">
              {MINUTES.map((m) => <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m < 60 ? `${m} د` : `${m / 60} س`}</button>)}
            </div>
          </div>
        </div>
        <Field label="التفاصيل" error={fields.details}>{(id) => <textarea id={id} className="input textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="ماذا يجب أن يُعمل؟" />}</Field>
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}
