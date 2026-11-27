import { BadgeCheck, Clock3, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'
import { api, ApiError } from '../../api/client'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { NxAvatar } from '../../ui/nx'
import { Button } from '../../ui/primitives'
import { TimeField } from '../../ui/TimeField'
import { useToast } from '../../ui/Toast'
import { hm, STATE, type Row } from './CommandCenter'

const nowHM = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit' })

/** A light window over the board: record or correct one person's day, or approve it. */
export function DayDialog({ row, date, onClose, onSaved }: { row: Row; date: string; onClose(): void; onSaved(): void }) {
  const toast = useToast()
  const [checkIn, setIn] = useState(row.day?.check_in ?? '')
  const [checkOut, setOut] = useState(row.day?.check_out ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const changed = checkIn !== (row.day?.check_in ?? '') || checkOut !== (row.day?.check_out ?? '')
  const pending = row.day?.approval_status === 'pending' && date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())
  const st = STATE[row.state]

  async function save() {
    setBusy('save'); setError(null)
    try {
      await api('/attendance/days', { method: 'PUT', body: { user_id: row.user.id, date, check_in: checkIn || null, check_out: checkOut || null, reason: reason.trim() || null } })
      toast('حُفظ الحضور')
      onSaved()
    } catch (e) { setError(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ.') } finally { setBusy(null) }
  }
  async function approve() {
    if (!row.day) return
    setBusy('approve'); setError(null)
    try {
      await api('/attendance/approve', { method: 'POST', body: { ids: [row.day.id] } })
      toast('اعتُمد اليوم')
      onSaved()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'تعذّر الاعتماد.') } finally { setBusy(null) }
  }

  return (
    <Dialog open onClose={onClose} className="cc-dialog" title="حضور اليوم" subtitle={`${row.user.name} · ${row.schedule ? `الدوام ${row.schedule}` : 'بلا دوام محدد'}`} icon={<Clock3 size={20} />}
      footer={<>
        <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        {pending && !changed && <Button icon={<BadgeCheck size={17} />} busy={busy === 'approve'} onClick={() => void approve()}>اعتماد اليوم</Button>}
        <Button variant="primary" busy={busy === 'save'} disabled={!changed} onClick={() => void save()}>حفظ</Button>
      </>}>
      <div className="cc-dlg">
        <div className="cc-dlg-who">
          <NxAvatar name={row.user.name} size={48} />
          <span><b>{row.user.name}</b><small>{row.user.job_title ?? '—'}</small></span>
          <span className="nx-chip nx-chip-dot" data-hue={st.hue}>{st.label}</span>
        </div>
        {row.day && (
          <div className="cc-dlg-facts num">
            <span><small>ساعات العمل</small><b>{hm(row.day.worked_minutes)}</b></span>
            <span><small>التأخير</small><b data-warn={row.day.late_minutes > 0 || undefined}>{hm(row.day.late_minutes)}</b></span>
            <span><small>الإضافي</small><b>{hm(row.day.overtime_minutes)}</b></span>
          </div>
        )}
        <div className="cc-dlg-times">
          <div className="cc-dlg-time">
            <span className="cc-dlg-l"><LogIn size={16} /> الدخول</span>
            <TimeField label="وقت الدخول" value={checkIn} onChange={setIn} />
            {!checkIn && <button type="button" className="cc-now-btn" onClick={() => setIn(nowHM())}>الآن</button>}
          </div>
          <div className="cc-dlg-time">
            <span className="cc-dlg-l"><LogOut size={16} /> الخروج</span>
            <TimeField label="وقت الخروج" value={checkOut} onChange={setOut} />
            {checkIn && !checkOut && <button type="button" className="cc-now-btn" onClick={() => setOut(nowHM())}>الآن</button>}
          </div>
        </div>
        {changed && (
          <label className="field">
            <span className="label">سبب التعديل</span>
            <textarea className="input textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: نسي التسجيل، عطل في الجوال" />
          </label>
        )}
        {pending && !changed && <p className="nx-note">هذا اليوم بانتظار الاعتماد. راجعه ثم اضغط «اعتماد اليوم».</p>}
        {row.permission && <p className="nx-note">لديه إذن معتمد اليوم: {row.permission}.</p>}
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}
