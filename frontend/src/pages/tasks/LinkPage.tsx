import { CheckCircle2, CircleAlert, MapPin, Phone, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { Button, Logo } from '../../ui/primitives'
import { PRIORITY, durationText, timeOf, type Priority } from './lib'

interface LinkTask {
  number: number; type: string | null; details: string | null; subscriber_name: string | null; subscriber_phone: string | null
  zone: string | null; location_text: string | null; priority: Priority; expected_minutes: number; status: string
  assignees: string[]; shared: boolean; started_at: string | null; completed_at: string | null
}

/** /t/<token>: the task a technician opens from WhatsApp, without signing in. Two big buttons. */
export function LinkPage() {
  useDocumentTitle('مهمة')
  const { token = '' } = useParams()
  const [t, setT] = useState<LinkTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    api<{ task: LinkTask }>(`/t/${token}`).then((r) => setT(r.task)).catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'هذا الرابط غير صالح.' : 'تعذّر فتح المهمة. تأكد من الإنترنت.'))
  }, [token])

  async function act(action: 'start' | 'complete') {
    setBusy(true)
    try {
      const r = await api<{ task: LinkTask }>(`/t/${token}/${action}`, { method: 'POST', body: { notes: notes.trim() || null, operation: crypto.randomUUID() } })
      setT(r.task)
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.')
    } finally { setBusy(false) }
  }

  return (
    <div className="scan">
      <div className="scan-brand"><Logo height={42} /></div>
      <section className="card glass scan-step af-link-task">
        {error ? <><CircleAlert size={40} className="scan-bad" /><h1>{error}</h1></> : !t ? <p role="status"><span className="spinner" aria-hidden="true" /> جارٍ التحميل…</p> : (
          <>
            <p className="eyebrow">مهمة رقم <b className="num">{t.number}</b>{t.priority !== 'normal' ? ` · ${PRIORITY[t.priority].label}` : ''}</p>
            <h1>{t.type}</h1>
            {t.details && <p className="af-task-details">{t.details}</p>}
            <div className="af-my-info">
              {t.subscriber_name && <span><b>{t.subscriber_name}</b></span>}
              {t.subscriber_phone && <a className="af-call num" href={`tel:${t.subscriber_phone}`} dir="ltr"><Phone size={16} /> {t.subscriber_phone}</a>}
              {(t.zone || t.location_text) && <span><MapPin size={15} /> {[t.zone, t.location_text].filter(Boolean).join(' · ')}</span>}
              <span className="af-sub">المدة المتوقعة {durationText(t.expected_minutes)}</span>
            </div>
            {t.status === 'done' ? (
              <div className="scan-done"><span className="scan-ico"><CheckCircle2 size={34} /></span><h1>أُنجزت المهمة</h1><p className="eyebrow">الساعة {timeOf(t.completed_at)}. شكراً لك.</p></div>
            ) : t.status === 'cancelled' ? (
              <h1>أُلغيت هذه المهمة.</h1>
            ) : t.status === 'in_progress' ? (
              t.shared ? <p className="af-explain">مهمة مشتركة: يسجّل المكتب إنجازها.</p> : (
                <>
                  <textarea className="input textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ماذا عملت؟ (اختياري)" aria-label="ملاحظات" />
                  <Button variant="primary" size="lg" block busy={busy} icon={<CheckCircle2 size={22} />} onClick={() => void act('complete')}>أنجزت المهمة</Button>
                </>
              )
            ) : (
              <Button variant="primary" size="lg" block busy={busy} icon={<Play size={22} />} onClick={() => void act('start')}>بدأت العمل</Button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
