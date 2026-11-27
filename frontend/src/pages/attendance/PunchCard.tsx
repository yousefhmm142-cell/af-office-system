import { CheckCircle2, Clock3, CloudOff, LogIn, LogOut } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { clock12 } from '../../lib/format'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { formatTime } from '../../lib/format'
import { enqueue, flushPunches, onQueueChange, queued } from '../../lib/punchQueue'
import { useOnline } from '../../lib/useOnline'
import { useLoad } from '../../lib/useLoad'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { punch, type Mine } from './lib'

const CACHE = 'af-att-me'
const hhmm = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Gaza' }).format(d)
const todayGaza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())

function readCache(): Mine | null {
  try {
    const m = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as Mine | null
    return m && m.today === todayGaza() ? m : null
  } catch {
    return null
  }
}

/**
 * The big button on the home page: «سجّل حضور» / «سجّل انصراف», from anywhere.
 * Without internet the press is kept on the phone with its time and sent later by itself.
 */
export function PunchCard({ reminder = false, onRecorded }: { reminder?: boolean; onRecorded?: () => void } = {}) {
  const toast = useToast()
  const online = useOnline()
  const { data: live, reload } = useLoad<Mine>('/attendance/me')
  const pending = useSyncExternalStore(onQueueChange, () => queued().length)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (live) try { localStorage.setItem(CACHE, JSON.stringify(live)) } catch { /* not kept */ }
  }, [live])
  // When the queue empties (sent), show the server's own view again.
  useEffect(() => { if (pending === 0 && online) void reload() }, [pending, online, reload])

  const data = live ?? readCache()
  if (!data) return null

  // The phone's own view while presses wait to be sent: one waiting press = in, two = in and out.
  const waiting = queued()
  let { next } = data
  let day = data.today_day
  if (waiting.length) {
    const firstAt = new Date(waiting[0]!.device_time)
    if (!day?.check_in) {
      day = { ...(day ?? {} as NonNullable<typeof day>), check_in: hhmm(firstAt), check_out: null } as typeof day
      next = waiting.length > 1 ? { status: 'full', message: '', wait_until: null } : { status: 'wait', message: '', wait_until: new Date(firstAt.getTime() + 3600_000).toISOString() }
      if (waiting.length > 1 && day) day = { ...day, check_out: hhmm(new Date(waiting[1]!.device_time)) }
    } else if (!day.check_out) {
      day = { ...day, check_out: hhmm(firstAt) }
      next = { status: 'full', message: '', wait_until: null }
    }
  }

  if (['no_branch', 'not_tracked', 'module_off'].includes(next.status)) return null
  const waitUntil = next.wait_until ? new Date(next.wait_until) : null
  const blocked = (next.status === 'wait' || next.status === 'repeat') && waitUntil && waitUntil.getTime() > Date.now()
  const canPress = next.status === 'in' || next.status === 'out' || ((next.status === 'wait' || next.status === 'repeat') && !blocked)
  const label = next.status === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف'

  function keepOffline() {
    enqueue({ uuid: crypto.randomUUID(), device_time: new Date().toISOString() })
    toast('حُفظ التسجيل على جوالك، وسيُرسل تلقائياً عند عودة الإنترنت.')
  }

  async function press() {
    if (!navigator.onLine) return keepOffline()
    setBusy(true)
    const uuid = crypto.randomUUID()
    const at = new Date().toISOString()
    try {
      const res = await punch({ method: 'app', uuid })
      toast(res.message, res.ok ? 'ok' : 'danger')
      await reload()
      if (res.ok) onRecorded?.()
    } catch (e) {
      // The internet dropped on the way: keep the press with the same id (the server counts it once).
      if (e instanceof ApiError && e.status === 0) {
        enqueue({ uuid, device_time: at })
        toast('حُفظ التسجيل على جوالك، وسيُرسل تلقائياً عند عودة الإنترنت.')
      } else toast(e instanceof ApiError ? e.message : 'لم يُسجَّل', 'danger')
    } finally { setBusy(false) }
  }

  return (
    <section className="card glass af-punch" data-state={next.status}>
      <div className="af-punch-info">
        <p className="eyebrow">حضور اليوم{data.is_work_day === false ? ' · يوم راحة' : data.schedule ? ` · دوامك ${clock12(data.schedule.start_time)} – ${clock12(data.schedule.end_time)}` : ''}</p>
        {reminder && canPress && next.status === 'in' && data.is_work_day && data.schedule && hhmm(new Date()) >= data.schedule.start_time &&
          <p className="banner warn" role="status"><Clock3 size={16} /> حان موعد دوامك. سجّل حضورك.</p>}
        <div className="af-punch-times">
          <span><LogIn size={16} /> حضور <b className="num">{clock12(day?.check_in) || '—'}</b></span>
          <span><LogOut size={16} /> انصراف <b className="num">{clock12(day?.check_out) || '—'}</b></span>
          {!waiting.length && day && day.late_minutes > 0 && <span className="af-late">تأخير <b className="num">{day.late_minutes}</b> دقيقة</span>}
        </div>
        {pending > 0 && (
          <p className="af-pending"><CloudOff size={15} /> {pending === 1 ? 'تسجيل واحد محفوظ' : `${pending} تسجيلات محفوظة`} على جوالك، وسيُرسل تلقائياً عند عودة الإنترنت
            {online && <button type="button" className="link-btn" onClick={() => void flushPunches()}>أرسل الآن</button>}
          </p>
        )}
      </div>
      {next.status === 'full' ? (
        <span className="af-punch-done"><CheckCircle2 size={22} /> اكتمل يومك</span>
      ) : blocked ? (
        <span className="af-punch-wait"><Clock3 size={18} /> يُتاح الانصراف الساعة <b className="num">{formatTime(waitUntil)}</b></span>
      ) : (
        <Button variant="primary" size="lg" busy={busy} disabled={!canPress} icon={next.status === 'in' ? <LogIn size={20} /> : <LogOut size={20} />} onClick={() => void press()}>
          {label}
        </Button>
      )}
      <Link to="/attendance/me" className="link-btn af-punch-more">حضوري خلال الشهر</Link>
    </section>
  )
}
