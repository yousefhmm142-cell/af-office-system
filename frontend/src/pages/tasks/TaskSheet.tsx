import { Ban, CheckCircle2, ClipboardList, Copy, Image as ImageIcon, MapPin, MessageCircle, Phone, Play, Send, UserCog, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { api, ApiError, openFile } from '../../api/client'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { EVENT, PRIORITY, STATUS, durationText, linkFor, timeOf, whatsappText, whatsappUrl, type Options, type Task } from './lib'

/** Everything about one task, with the next sensible action as the big button. */
export function TaskSheet({ id, options, onClose, onChanged }: { id: number; options: Options | null; onClose(): void; onChanged(): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, setData } = useLoad<{ task: Task; can_manage: boolean }>(`/tasks/${id}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [reassign, setReassign] = useState<number[] | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  async function act(action: string, body: Record<string, unknown> = {}, ok?: string) {
    setBusy(action)
    try {
      const res = await api<{ task: Task }>(`/tasks/${id}/${action}`, { method: 'POST', body })
      setData({ task: { ...res.task }, can_manage: data!.can_manage })
      if (ok) toast(ok)
      onChanged()
      return res.task
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.', 'danger')
      return null
    } finally { setBusy(null) }
  }

  async function sendWhatsapp(phone: string, code: number) {
    const t = data!.task
    window.open(whatsappUrl(phone, whatsappText(t), code), '_blank')
    await act('send', { channel: 'whatsapp' })
  }

  async function saveAssignees() {
    setBusy('reassign')
    try {
      const res = await api<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: { assignees: reassign } })
      setData({ task: res.task, can_manage: data!.can_manage })
      setReassign(null)
      toast('تغيّر الفني. أرسل المهمة من جديد.')
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.', 'danger')
    } finally { setBusy(null) }
  }

  const t = data?.task
  const manage = data?.can_manage ?? false
  return (
    <Dialog open onClose={onClose} className="af-compose" icon={<ClipboardList size={20} />}
      title={t ? `مهمة رقم ${t.number} · ${t.type?.name ?? ''}` : 'المهمة'}
      subtitle={t ? `${STATUS[t.status].label}${t.late ? ' · متأخرة' : ''}` : undefined}>
      {loading && !t ? <Loading /> : !t ? <ErrorBanner text={error} /> : (
        <div className="af-sheet">
          <div className="af-badges">
            <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
            {t.priority !== 'normal' && <Pill tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Pill>}
            {t.late && <Pill tone="danger">متأخرة</Pill>}
            {t.recorded_offline && <Pill tone="info" dot={false}><WifiOff size={12} /> سُجّلت دون إنترنت</Pill>}
          </div>

          {t.details && <p className="af-task-details">{t.details}</p>}
          <div className="rows">
            {(t.subscriber_name || t.subscriber_phone) && (
              <div className="row af-kv"><span className="row-label">المشترك</span><span className="row-value">{t.subscriber_name}
                {t.subscriber_phone && <a className="af-call num" href={`tel:${t.subscriber_phone}`} dir="ltr"><Phone size={14} /> {t.subscriber_phone}</a>}</span></div>
            )}
            {(t.zone || t.location_text) && <div className="row af-kv"><span className="row-label"><MapPin size={14} /> المكان</span><span className="row-value">{[t.zone?.name, t.location_text].filter(Boolean).join(' · ')}</span></div>}
            <div className="row af-kv"><span className="row-label">المدة المتوقعة</span><span className="row-value">{durationText(t.expected_minutes)}{t.actual_minutes !== null ? ` · الفعلية ${durationText(t.actual_minutes)}` : ''}</span></div>
            {t.completion_notes && <div className="row af-kv"><span className="row-label">ملاحظات الإنجاز</span><span className="row-value">{t.completion_notes}</span></div>}
            {t.cancel_reason && <div className="row af-kv"><span className="row-label">سبب الإلغاء</span><span className="row-value">{t.cancel_reason}</span></div>}
          </div>
          {t.has_photo && <Button icon={<ImageIcon size={16} />} onClick={() => void openFile(`/tasks/${t.id}/photo`)}>صورة الإنجاز</Button>}

          <section>
            <h3 className="af-h3">الفنيون</h3>
            {reassign ? (
              <div className="af-techs">
                {options?.technicians.map((x) => (
                  <button key={x.id} type="button" className="af-tech" aria-pressed={reassign.includes(x.id)} onClick={() => setReassign(reassign.includes(x.id) ? reassign.filter((y) => y !== x.id) : [...reassign, x.id])}>
                    <Avatar name={x.name} size={30} /><span><b>{x.name}</b><small>{x.open ? `${x.open} مفتوحة` : 'متفرّغ'}</small></span>
                  </button>
                ))}
                <div className="af-switches"><Button variant="primary" busy={busy === 'reassign'} onClick={() => void saveAssignees()}>حفظ</Button><Button onClick={() => setReassign(null)}>إلغاء</Button></div>
              </div>
            ) : (
              <div className="af-assignees">
                {t.assignees.length === 0 && <p className="eyebrow">لم يُختر فني بعد.</p>}
                {t.assignees.map((a) => (
                  <div key={a.id} className="af-assignee">
                    <Avatar name={a.name} size={34} /><b>{a.name}</b>
                    {manage && t.status !== 'done' && t.status !== 'cancelled' && (a.phone
                      ? <Button icon={<MessageCircle size={16} />} busy={busy === 'send'} onClick={() => void sendWhatsapp(a.phone!, a.wa_code ?? 970)}>واتساب</Button>
                      : <small className="af-missing">بلا رقم جوال</small>)}
                  </div>
                ))}
                {manage && options && ['new', 'sent', 'seen'].includes(t.status) && <button type="button" className="link-btn" onClick={() => setReassign(t.assignees.map((a) => a.id))}><UserCog size={15} /> تغيير الفني</button>}
              </div>
            )}
          </section>

          {t.link_token && t.status !== 'done' && t.status !== 'cancelled' && (
            <button type="button" className="link-btn" onClick={() => { void navigator.clipboard?.writeText(linkFor(t.link_token!)); toast('نُسخ رابط المهمة') }}><Copy size={15} /> نسخ الرابط الخاص بالفني</button>
          )}

          {cancelling ? (
            <div className="af-cancel">
              <Field label="سبب الإلغاء">{(fid) => <input id={fid} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: المشترك ألغى الطلب" />}</Field>
              <div className="af-switches"><Button variant="danger" busy={busy === 'cancel'} onClick={async () => { if (await act('cancel', { reason }, 'أُلغيت المهمة')) setCancelling(false) }}>تأكيد الإلغاء</Button><Button onClick={() => setCancelling(false)}>رجوع</Button></div>
            </div>
          ) : manage && t.status !== 'done' && t.status !== 'cancelled' && (
            <div className="af-sheet-actions">
              {t.status === 'new' && t.assignees.length > 0 && <Button variant="primary" icon={<Send size={18} />} busy={busy === 'send'} onClick={() => void act('send', { channel: 'app' }, 'أُرسلت داخل النظام')}>إرسال داخل النظام</Button>}
              {['new', 'sent', 'seen'].includes(t.status) && t.assignees.length > 0 && <Button icon={<Play size={18} />} busy={busy === 'start'} onClick={() => void act('start', {}, 'بدأ العمل')}>بدأ العمل</Button>}
              {t.assignees.length > 0 && (
                <Button variant="primary" icon={<CheckCircle2 size={18} />} busy={busy === 'complete'} onClick={async () => {
                  if (await confirm({ title: 'تسجيل الإنجاز عن الفني؟', message: t.assignees.length > 1 ? 'مهمة مشتركة: يُنهيها المكتب.' : 'استخدمه إذا لم يكن مع الفني جوال.', confirmLabel: 'أُنجزت' }))
                    void act('complete', { notes: notes.trim() || null }, 'سُجّل الإنجاز')
                }}>تسجيل الإنجاز</Button>
              )}
              <Button variant="ghost" icon={<Ban size={18} />} onClick={() => setCancelling(true)}>إلغاء المهمة</Button>
            </div>
          )}
          {manage && t.status !== 'done' && t.status !== 'cancelled' && t.assignees.length > 0 && (
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة الإنجاز (اختياري)" aria-label="ملاحظة الإنجاز" />
          )}

          <section>
            <h3 className="af-h3">السجل</h3>
            <ol className="af-events">
              {t.events?.map((e, i) => (
                <li key={i}><span className="af-ev-dot" data-e={e.event} /><span><b>{EVENT[e.event] ?? e.event}</b><small>{e.actor ?? (e.meta && 'via_link' in e.meta ? 'الفني عبر الرابط' : '—')}{e.offline ? ' · دون إنترنت' : ''}</small></span><time className="num">{timeOf(e.at)}</time></li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  )
}
