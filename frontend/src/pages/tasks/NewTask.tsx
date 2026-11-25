import { CheckCheck, ClipboardPlus, MessageCircle, PhoneIncoming, Save, Send, UserRound } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Avatar, Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { SubscriberField } from './SubscriberField'
import { readSubscribersFile, type Subscriber } from './subscribers'
import { MINUTES, PRIORITY, durationText, whatsappText, whatsappUrl, type Options, type Priority, type Task } from './lib'

/**
 * A new task in a few taps: what (type), who (technicians), for whom (subscriber), where, how urgent,
 * how long. Then «send by WhatsApp», «send in the app», or just keep it for later.
 */
export function NewTask({ options, onClose, onSaved, branchStyle = false, prepare = false }: { options: Options; branchStyle?: boolean; prepare?: boolean; onClose(): void; onSaved(t: Task, keepOpen?: boolean): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const directoryPath = `/tasks/subscribers?branch_id=${options.branch_id}`
  const directory = useLoad<{ subscribers: Subscriber[] }>(branchStyle ? directoryPath : null)
  const subscribers = directory.data?.subscribers ?? []

  const types = options.types.filter((t) => t.is_active)
  const [typeId, setTypeId] = useState<number | null>(null)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [techs, setTechs] = useState<number[]>([])
  const [subscriber, setSubscriber] = useState('')
  const [phone, setPhone] = useState('')
  const [zoneId, setZoneId] = useState<number | null>(null)
  const [place, setPlace] = useState('')
  const [board, setBoard] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [minutes, setMinutes] = useState(60)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const shownTypes = showAllTypes ? types : types.slice(0, 10)
  const technicians = useMemo(() => [...options.technicians].sort((a, b) => a.open - b.open || a.name.localeCompare(b.name, 'ar')), [options])

  async function save(send: 'whatsapp' | 'app' | null, keepOpen = false) {
    if (busy) return
    const location = [place.trim(), board.trim() && `طبلون ${board.trim()}`].filter(Boolean).join(' · ')
    if (location.length > 200) return setFields({ location_text: 'اختصر وصف المكان أو اسم الطبلون.' })
    if (!typeId) return setFields({ task_type_id: 'اختر نوع المهمة.' })
    setBusy(send ?? 'save'); setFields({}); setError(null)
    try {
      const res = await api<{ task: Task }>('/tasks', {
        method: 'POST',
        body: {
          branch_id: options.branch_id, task_type_id: typeId, assignees: techs, subscriber_name: subscriber.trim() || null,
          subscriber_phone: phone.trim() || null, zone_id: zoneId, location_text: location || null, priority,
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
      if (keepOpen) {
        setTypeId(null)
        setTechs([])
        setSubscriber('')
        setPhone('')
        setZoneId(null)
        setPlace('')
        setBoard('')
        setPriority('normal')
        setMinutes(60)
        setDetails('')
      }
      onSaved(res.task, keepOpen)
    } catch (e) {
      if (e instanceof ApiError) { setFields(e.fields); setError(Object.keys(e.fields).length ? null : e.message) }
    } finally { setBusy(null) }
  }

  async function importList(file: File) {
    setImporting(true)
    try {
      const list = await readSubscribersFile(file)
      if (!list.length) throw new Error('empty')
      const replace = await confirm({
        title: 'استيراد قائمة المشتركين؟',
        message: `سيصبح دليل هذا الفرع ${list.length} مشتركًا من الملف المحدد. أول الأسماء: ${list.slice(0, 3).map((item) => item.n).join('، ')}.`,
        confirmLabel: 'استيراد القائمة',
      })
      if (!replace) return
      const result = await api<{ count: number }>(directoryPath, { method: 'PUT', body: { subscribers: list } })
      await directory.reload()
      toast(`تم تحميل ${result.count} مشترك`)
    } catch (e) {
      const messages: Record<string, string> = {
        no_header: 'يلزم عمود «اسم المشترك» وعمود للجوال أو المنطقة أو الطبلون.',
        frameset: 'اختر ملف Excel أو ورقة الجدول من مجلد الملفات.',
        too_large: 'حجم الملف أكبر من 5 ميغابايت.',
        pdf_layout: 'يتطلب الاستيراد PDF نصيًا بجدول عناوين وأعمدة واضحة. استخدم Excel للملفات المصوّرة.',
        empty: 'لا توجد أسماء مشتركين في الملف.',
      }
      toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message
        : (e instanceof Error ? messages[e.message] : undefined) ?? 'تعذّرت قراءة الملف.', 'danger')
    } finally {
      setImporting(false)
      if (input.current) input.current.value = ''
    }
  }

  const contactFields = (
    <div className={branchStyle ? 'form-card' : 'form-grid'}>
        {branchStyle && <>
          <input ref={input} type="file" accept=".xlsx,.xltx,.xlsm,.csv,.htm,.html,.pdf" hidden
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void importList(file) }} />
          <Button variant="ghost" busy={importing} disabled={importing} icon={<UserRound size={18} />} onClick={() => input.current?.click()}>
            قائمة المشتركين{subscribers.length ? ` (${subscribers.length})` : ''} · استيراد Excel أو PDF
          </Button>
          <ErrorBanner text={directory.error} />
        </>}
        <div className="af-row2">
          {branchStyle ? <SubscriberField label="المشترك (اختياري)" list={subscribers} value={subscriber} onChange={setSubscriber} onPick={(item) => {
            const localPhone = (item.p ?? '').replace(/^(?:00)?(?:970|972)(?=5[0-9]{8}$)/, '0')
            setPhone(/^05[0-9]{8}$/.test(localPhone) ? localPhone : '')
            const zone = options.zones.find((entry) => entry.is_active && entry.name === item.a)
            setZoneId(zone?.id ?? null)
            setPlace(zone ? '' : (item.a ?? ''))
            setBoard(item.b ?? '')
          }} /> : <Field label="المشترك (اختياري)" error={fields.subscriber_name}>{(id) => <input id={id} className="input" value={subscriber} onChange={(e) => setSubscriber(e.target.value)} />}</Field>}
          {branchStyle && fields.subscriber_name && <span className="field-error">{fields.subscriber_name}</span>}
          <Field label="جوال المشترك" error={fields.subscriber_phone}>{(id) => <input id={id} className="input num" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />}</Field>
        </div>

        {branchStyle && <Field label="الطبلون">{(id) => <input id={id} className="input num" maxLength={80}
          placeholder="رقم أو اسم الطبلون" value={board} onChange={(event) => setBoard(event.target.value)} />}</Field>}
        {options.zones.some((z) => z.is_active) && (
          <div className="field">
            <label>المنطقة</label>
            <div className="chips">
              {options.zones.filter((z) => z.is_active).map((z) => <button key={z.id} type="button" className="chip" aria-pressed={zoneId === z.id} onClick={() => setZoneId(zoneId === z.id ? null : z.id)}>{z.name}</button>)}
            </div>
          </div>
        )}
        <Field label="وصف المكان" error={fields.location_text}>{(id) => <input id={id} className="input" maxLength={board.trim() ? 192 - board.trim().length : 200} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="مثال: قرب المسجد، الطابق الثاني" />}</Field>

    </div>
  )
  const summary = branchStyle ? (
    <>
      <h3>ملخص المهمة <span className="aside-tag">قبل الحفظ</span></h3>
      <div><span className="aside-label">المشترك</span><div className="aside-big">{subscriber.trim() || '—'}</div></div>
      <div className="aside-box">
        <div className="aside-row"><span>الجوال</span><b dir="ltr">{phone || '—'}</b></div>
        <div className="aside-row"><span>المنطقة</span><b>{options.zones.find((zone) => zone.id === zoneId)?.name ?? (place.trim() || '—')}</b></div>
        <div className="aside-row"><span>الطبلون</span><b className="num">{board.trim() || '—'}</b></div>
      </div>
      <div className="aside-box aside-hide-sm">
        <div className="aside-row"><span>المطلوب</span><b>{types.find((item) => item.id === typeId)?.name ?? '—'}</b></div>
        <div className="aside-row"><span>الفني</span><b>{prepare ? 'يُختار لاحقًا' : (technicians.filter((person) => techs.includes(person.id)).map((person) => person.name).join('، ') || '—')}</b></div>
      </div>
      {prepare && <p className="aside-note">تظهر المهمة في قائمة «بانتظار فني» بعد الحفظ.</p>}
    </>
  ) : undefined

  return (
    <Dialog open onClose={onClose} title={prepare ? 'تجهيز مهمة' : 'مهمة جديدة'} icon={prepare ? <PhoneIncoming size={20} /> : <ClipboardPlus size={20} />}
      aside={summary} className={branchStyle ? undefined : 'af-compose'}
      subtitle={prepare ? 'سجّل طلب المشترك، واختر الفني لاحقًا.' : undefined}
      footer={
        <div className="af-task-foot">
          {prepare ? (
            <>
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
              <Button disabled={!!busy || !typeId} onClick={() => void save(null, true)}>حفظ وتجهيز ثانية</Button>
              <Button variant="primary" icon={<CheckCheck size={17} />} busy={busy === 'save'} disabled={!typeId} onClick={() => void save(null)}>تجهيز المهمة</Button>
            </>
          ) : <>
          <Button variant="primary" size="lg" icon={<MessageCircle size={18} />} busy={busy === 'whatsapp'} disabled={!typeId || techs.length === 0} onClick={() => void save('whatsapp')}>حفظ وإرسال واتساب</Button>
          <Button icon={<Send size={18} />} busy={busy === 'app'} disabled={!typeId || techs.length === 0} onClick={() => void save('app')}>إرسال داخل النظام</Button>
          <Button variant="ghost" icon={<Save size={18} />} busy={busy === 'save'} disabled={!typeId} onClick={() => void save(null)}>حفظ دون إرسال</Button>
          </>}
        </div>
      }>
      <div className="form-grid" onKeyDown={(event) => {
        if (prepare && typeId && !busy && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          void save(null)
        }
      }}>
        {branchStyle && contactFields}
        <div className={branchStyle ? "field form-card" : "field"}>
          <label>نوع المهمة</label>
          <div className="chips">
            {shownTypes.map((t) => <button key={t.id} type="button" className="chip" aria-pressed={typeId === t.id} onClick={() => { setTypeId(t.id); setMinutes(t.default_minutes) }}>{t.name}</button>)}
            {!showAllTypes && types.length > 10 && <button type="button" className="chip" onClick={() => setShowAllTypes(true)}>المزيد…</button>}
          </div>
          {fields.task_type_id && <span className="field-error">{fields.task_type_id}</span>}
        </div>

        {!prepare && (        <div className="field">
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
        )}
        {!branchStyle && contactFields}

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
