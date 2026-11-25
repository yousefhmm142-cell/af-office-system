import { EmptyArt } from '../../ui/fx/EmptyArt'
import { CalendarDays, Check, ChevronLeft, ChevronRight, MessageCircle, Printer, TriangleAlert, Undo2, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatTime, formatWeekday } from '../../lib/format'
import { addDays, dayName, describeDay, isISODate, todayISO, type ISODate } from '../../lib/dates'
import { useNow } from '../../lib/useNow'
import { Dialog } from '../../ui/Dialog'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { useConfirm } from '../../ui/Confirm'
import { saveFile } from '../../lib/saveFile'
import { statusInfo, type SheetMeta } from './workflow'

const stamp = (iso: string | null) => iso ? `${formatWeekday(new Date(iso))} · ${formatTime(new Date(iso))}` : ''

export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback))}
    >
      <ChevronRight size={18} aria-hidden="true" /> رجوع
    </button>
  )
}

export function DayJump({ date, hrefFor }: { date: ISODate; hrefFor(date: ISODate): string }) {
  const today = todayISO()
  const before = addDays(date, -1)
  const after = addDays(date, 1)
  return (
    <nav className="day-jump" aria-label="تغيير اليوم">
      <Link to={hrefFor(before)} className="day-jump-link" replace>
        <ChevronRight size={16} aria-hidden="true" /> {dayName(before, today)}
      </Link>
      {date !== today && (
        <Link to={hrefFor(today)} className="day-jump-link today" replace>اليوم</Link>
      )}
      {after <= today && (
        <Link to={hrefFor(after)} className="day-jump-link" replace>
          {dayName(after, today)} <ChevronLeft size={16} aria-hidden="true" />
        </Link>
      )}
    </nav>
  )
}

export function DateNav({ date, onChange }: { date: ISODate; onChange(date: ISODate): void }) {
  const today = todayISO()
  const picker = useRef<HTMLInputElement>(null)
  const { weekday, date: longDate } = describeDay(date)
  const relative = dayName(date, today)
  const go = (d: ISODate) => d <= today && onChange(d)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return
      if (e.key === 'ArrowRight') go(addDays(date, -1))
      if (e.key === 'ArrowLeft') go(addDays(date, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="datenav glass">
      <button type="button" aria-label="اليوم السابق" onClick={() => go(addDays(date, -1))}>
        <ChevronRight size={20} />
      </button>
      <div className="datenav-label">
        <b>{relative === weekday ? weekday : `${relative} · ${weekday}`}</b>
        <small className="num">{longDate}</small>
      </div>
      <button type="button" aria-label="اليوم التالي" disabled={date >= today} onClick={() => go(addDays(date, 1))}>
        <ChevronLeft size={20} />
      </button>
      <button type="button" aria-label="اختيار يوم من التقويم" onClick={() => picker.current?.showPicker?.()}>
        <CalendarDays size={18} />
      </button>
      <input
        ref={picker}
        type="date"
        className="sr-only"
        tabIndex={-1}
        max={today}
        value={date}
        onChange={(e) => isISODate(e.target.value) && go(e.target.value)}
      />
    </div>
  )
}

/** Status, where it came from, and the manager's actions: return with a reason, print, approve. */
export function StatusBar({ sheet, source, canAct, onApprove, onReturn, returnPlaceholder, extraActions }: {
  sheet: SheetMeta
  source: string
  canAct: boolean
  onApprove(): Promise<void>
  onReturn(reason: string): Promise<void>
  returnPlaceholder: string
  extraActions?: ReactNode
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [reason, setReason] = useState('')
  const info = statusInfo[sheet.status]
  const waiting = canAct && sheet.status === 'submitted'
  const canReopen = canAct && (sheet.status === 'submitted' || sheet.status === 'approved')

  async function approve() {
    const yes = await confirm({ title: 'اعتماد اليوم؟', message: 'بعد الاعتماد يُقفل اليوم. تقدر ترجع تفتحه بزر «إعادة فتح اليوم».', confirmLabel: 'اعتماد' })
    if (!yes) return
    setBusy(true)
    try {
      await onApprove()
      toast('اعتُمد')
    } catch {
      toast('تعذّر الاعتماد. حدّث الصفحة وحاول مرة أخرى.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  /** The printed form as a PDF, into WhatsApp (the phone's share list), or saved when sharing is not possible here. */
  async function whatsapp() {
    const el = document.querySelector<HTMLElement>('.print-sheet')
    if (!el) return
    setBusy(true)
    try {
      const title = document.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'كشف'
      const { sheetToPdf } = await import('../../lib/sheetPdf')
      const pdf = await sheetToPdf(el)
      const file = new File([pdf], `${title}.pdf`, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title })
      } else {
        await saveFile(pdf, file.name, file.type)
        toast('نُزّل ملف PDF للمشاركة.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast('تعذّر تجهيز ملف PDF. حاول مرة أخرى.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function sendBack() {
    if (!reason.trim()) return
    setBusy(true)
    try {
      await onReturn(reason)
      setReturnOpen(false)
      setReason('')
      toast('أُعيد فتح اليوم')
    } catch {
      toast('تعذّرت إعادة الفتح. حاول مرة أخرى.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="statusbar glass">
      <Pill tone={info.tone}>{info.label}</Pill>
      <p>
        {sheet.status === 'draft' || (sheet.status === 'returned' && !sheet.submittedAt) ? (
          <>
            <span className="live-dot" aria-hidden="true" />
            يُعبّأ الآن في {source} <span className="muted">· آخر تعديل {formatTime(new Date(sheet.updatedAt))}</span>
          </>
        ) : (
          <>وصل من {source} <span className="muted">· {stamp(sheet.submittedAt)}</span></>
        )}
        {sheet.recordedOffline && <span className="muted"> · <WifiOff size={13} className="inline-ico" /> أُرسل بدون اتصال</span>}
        {sheet.status === 'returned' && <span className="muted"> · أُعيد فتحه: {sheet.returnedReason}</span>}
      </p>
      <div className="statusbar-actions">
        {extraActions}
        {canReopen && (
          <Button variant="ghost" icon={<Undo2 size={17} />} onClick={() => setReturnOpen(true)}>
            إعادة فتح اليوم
          </Button>
        )}
        <Button icon={<Printer size={17} />} onClick={() => window.print()}>
          طباعة كالورقة
        </Button>
        <Button variant="secondary" busy={busy} icon={<MessageCircle size={17} />} onClick={() => void whatsapp()}>
          إرسال واتساب (PDF)
        </Button>
        {waiting && (
          <Button variant="primary" busy={busy} icon={<Check size={17} />} onClick={() => void approve()}>
            اعتماد
          </Button>
        )}
      </div>

      <Dialog
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="إعادة فتح اليوم"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturnOpen(false)}>إلغاء</Button>
            <Button variant="primary" busy={busy} disabled={!reason.trim()} icon={<Undo2 size={17} />} onClick={() => void sendBack()}>
              إعادة الفتح
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="label">لماذا يُعاد فتحه؟ يظهر هذا أعلى الصفحة عند موظف الموقع ليصحّح ثم يغلقه من جديد.</span>
          <textarea className="textarea" rows={3} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder={returnPlaceholder} />
        </label>
      </Dialog>
    </div>
  )
}

/** A day with nothing sent yet: still being filled, expected later, or late. */
export function NoSheet({ date, drafting, noun, source, listHref }: {
  date: ISODate
  drafting: boolean
  noun: string
  source: string
  listHref: string
}) {
  const now = useNow(60_000)
  const today = todayISO()
  const gazaHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Gaza' }).format(now))
  const late = date < addDays(today, -1) || (date === addDays(today, -1) && gazaHour >= 10)
  return (
    <div className="empty card"><EmptyArt kind="clipboard" />
      <h3>{drafting ? `${noun} قيد التعبئة` : `لم يصل ${noun} هذا اليوم`}</h3>
      <p>
        {drafting
          ? `بدأ ${source} تعبئته ولم يرسله بعد. يظهر هنا كاملاً لحظة إرساله.`
          : date === today
            ? 'يصل عادة في نهاية اليوم بعد آخر تشغيلة.'
            : late
              ? `لم يصل بعد موعده. تواصل مع ${source}.`
              : 'يصل عادة صباح اليوم التالي.'}
      </p>
      {late && !drafting && <Pill tone="warn">تجاوز موعده</Pill>}
      <Link to={listHref} className="btn">آخر ما وصل</Link>
    </div>
  )
}

export function AlertsCard({ alerts }: { alerts: Array<{ id: string; level: 'warn' | 'danger'; title: string; detail: string }> }) {
  if (!alerts.length) return null
  return (
    <section className="card">
      <div className="card-h"><span className="ico-round"><TriangleAlert size={16} /></span><h2>تنبيهات هذا اليوم</h2></div>
      <ul className="alerts">
        {alerts.map((a) => (
          <li key={a.id} className={`alert ${a.level}`}>
            <span className="alert-ico" aria-hidden="true"><TriangleAlert size={17} /></span>
            <div>
              <b>{a.title}</b>
              <span>{a.detail}</span>
            </div>
            <span className="sr-only">{a.level === 'danger' ? 'خطر' : 'تحذير'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
