import { CheckCircle2, CircleAlert, Clock3, LogIn, LogOut, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clock12 } from '../../lib/format'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { firstName, formatTime } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { Button, Logo } from '../../ui/primitives'
import { position, punch, type PunchResult } from './lib'

/**
 * /a/<code>: the page a QR sheet opens. Signed in → it records straight away (in, then out).
 * Opening it again by refreshing the page only shows where you stand; it never records a second time by itself.
 */
export function Scan() {
  useDocumentTitle('تسجيل الحضور')
  const { code = '' } = useParams()
  const user = useUser()
  const [res, setRes] = useState<PunchResult | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [peekMode, setPeekMode] = useState(false)
  const started = useRef(false)

  async function run(peek: boolean, withPlace = false) {
    setBusy(true)
    setError(null)
    setPeekMode(peek)
    try {
      const place = withPlace ? await position() : null
      setRes(await punch({ method: 'qr', code, peek, uuid: crypto.randomUUID(), ...(place ?? {}) }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'لم يُسجَّل. حاول مرة أخرى.')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    void run(nav?.type === 'reload')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const done = res && !peekMode && (res.status === 'in' || res.status === 'out' || res.status === 'duplicate')
  const peeked = res && peekMode && (res.status === 'in' || res.status === 'out') // shown after a refresh
  const kindOut = res?.day?.check_out != null && (res.status === 'out' || res.status === 'duplicate')

  return (
    <div className="scan">
      <div className="scan-brand"><Logo height={42} /></div>
      <section className="card glass scan-step">
        {busy ? (
          <p role="status"><span className="spinner" aria-hidden="true" /> جارٍ التسجيل…</p>
        ) : error ? (
          <><CircleAlert size={40} className="scan-bad" /><h1>لم يُسجَّل</h1><p>{error}</p><Button variant="primary" onClick={() => void run(false)}>حاول مرة أخرى</Button></>
        ) : res && done ? (
          <div className={`scan-done${kindOut ? ' out' : ''}`}>
            <span className="scan-ico">{kindOut ? <LogOut size={34} /> : <LogIn size={34} />}</span>
            <p className="scan-hello">أهلاً {firstName(user.name)}</p>
            <h1>{res.status === 'duplicate' ? (kindOut ? 'انصرافك مسجّل' : 'حضورك مسجّل') : res.message}</h1>
            <p className="scan-time num">{clock12(kindOut ? res.day?.check_out : res.day?.check_in)}</p>
            {res.day && res.day.late_minutes > 0 && !kindOut && <p className="af-late">تأخير {res.day.late_minutes} دقيقة</p>}
          </div>
        ) : res && peeked ? (
          <>
            <h1>{res.status === 'in' ? 'لم تسجّل حضورك بعد' : 'يمكنك تسجيل انصرافك'}</h1>
            <Button variant="primary" size="lg" onClick={() => void run(false)} icon={res.status === 'in' ? <LogIn size={20} /> : <LogOut size={20} />}>
              {res.status === 'in' ? 'سجّل حضوري الآن' : 'سجّل انصرافي الآن'}
            </Button>
          </>
        ) : res ? (
          <>
            {res.status === 'full' || res.status === 'repeat' ? <CheckCircle2 size={40} className="scan-ok" /> : res.status === 'wait' ? <Clock3 size={40} className="scan-wait" /> : <CircleAlert size={40} className="scan-bad" />}
            <h1>{res.status === 'wait' && res.wait_until ? `يُتاح الانصراف الساعة ${formatTime(new Date(res.wait_until))}` : res.message}</h1>
            {res.status === 'location_needed' && <Button variant="primary" icon={<MapPin size={18} />} onClick={() => void run(false, true)}>اسمح بالموقع وسجّل</Button>}
            {res.status === 'too_far' && <Button onClick={() => void run(false, true)}>حاول مرة أخرى</Button>}
          </>
        ) : null}
      </section>
      <Link to="/" className="link-btn" style={{ justifySelf: 'center' }}>الرئيسية</Link>
    </div>
  )
}
