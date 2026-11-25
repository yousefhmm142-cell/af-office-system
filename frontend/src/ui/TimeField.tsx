import { useState } from 'react'
import { createPortal } from 'react-dom'
import { config } from '../config'
import { Dialog } from './Dialog'
import { Button } from './primitives'

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
type Half = 'am' | 'pm'
const to24 = (h12: number, half: Half) => (half === 'am' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12)
const to12 = (h24: number) => ((h24 + 11) % 12) + 1
const halfOf = (h24: number): Half => (h24 < 12 ? 'am' : 'pm')
const halfLetter = (h24: number) => (h24 < 12 ? 'ص' : 'م')

/** صباحاً / ظهراً / عصراً / مساءً / ليلاً for an hour of the day. */
function partOfDay(h: number): string {
  if (h < 5) return 'ليلاً'
  if (h < 12) return 'صباحاً'
  if (h < 15) return 'ظهراً'
  if (h < 18) return 'عصراً'
  if (h < 22) return 'مساءً'
  return 'ليلاً'
}

/** "1432", "14:32", "14.32", "9" -> "14:32" / "09:00"; null when it is not a time. */
function parseTyped(text: string): string | null {
  const t = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d:.]/g, '')
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2] ?? 0)
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null
}

/**
 * A clock time shown the 12-hour way, large, with ص/م and the part of the day under it (stored as
 * "14:30"). Tapping it opens the hour (1–12), ص/م and minute buttons, «الآن», and a box to type
 * the exact minute.
 */
export function TimeField({ id, label, value, onChange }: { id?: string; label: string; value: string; onChange(v: string): void }) {
  const [open, setOpen] = useState(false)
  const [h, m] = value ? value.split(':').map(Number) : [null, null]
  return (
    <>
      <button id={id} type="button" className={`time-btn${value ? '' : ' empty'}`} aria-label={value ? `${label}: ${to12(h!)}:${pad(m!)} ${halfLetter(h!)}` : label} onClick={() => setOpen(true)}>
        {value ? (
          <>
            <b className="num">{to12(h!)}:{pad(m!)}</b>
            <small>{halfLetter(h!)} · {partOfDay(h!)}</small>
          </>
        ) : (
          <span>اختر الوقت</span>
        )}
      </button>
      {open && createPortal(<TimePicker label={label} hour={h} minute={m} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false) }} />, document.body)}
    </>
  )
}

function TimePicker({ label, hour, minute, onPick, onClose }: {
  label: string
  hour: number | null
  minute: number | null
  onPick(v: string): void
  onClose(): void
}) {
  const [h12, setH12] = useState<number | null>(hour === null ? null : to12(hour))
  const [half, setHalf] = useState<Half>(hour === null ? 'am' : halfOf(hour))
  const [mi, setMi] = useState<number | null>(minute)
  const [typed, setTyped] = useState('')
  // Typed "2:30" follows the ص/م choice; "14:30" is taken as it is.
  const raw = parseTyped(typed)
  const typedTime = raw === null ? null : (() => {
    const [th, tm] = raw.split(':').map(Number) as [number, number]
    return `${pad(th >= 1 && th <= 12 ? to24(th, half) : th)}:${pad(tm)}`
  })()
  const ready = typed.trim() ? typedTime : (h12 !== null ? `${pad(to24(h12, half))}:${pad(mi ?? 0)}` : null)
  const readyH = ready === null ? null : Number(ready.slice(0, 2))
  const now = () => {
    const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: config.timeZone }).format(new Date())
    onPick(t)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={label}
      footer={
        <>
          <Button variant="secondary" onClick={now}>الآن</Button>
          {hour !== null && <Button variant="secondary" onClick={() => onPick('')}>مسح</Button>}
          <Button variant="primary" disabled={!ready} onClick={() => ready && onPick(ready)}>
            {ready ? <>اختيار <span className="num">{to12(readyH!)}:{ready.slice(3)} {halfLetter(readyH!)}</span></> : 'اختيار الوقت'}
          </Button>
        </>
      }
    >
      <div className="tp">
        <div className="tp-show num" aria-live="polite">
          <b>{ready ? `${to12(readyH!)}:${ready.slice(3)}` : '--:--'}</b>
          {ready && <small>{halfLetter(readyH!)} · {partOfDay(readyH!)}</small>}
        </div>
        <div className="tp-half" role="radiogroup" aria-label="صباحاً أو مساءً">
          <button type="button" role="radio" aria-checked={half === 'am'} onClick={() => setHalf('am')}><b>ص</b> صباحاً</button>
          <button type="button" role="radio" aria-checked={half === 'pm'} onClick={() => setHalf('pm')}><b>م</b> مساءً</button>
        </div>
        <span className="tp-label">الساعة</span>
        <div className="tp-grid hours" role="group" aria-label="الساعة">
          {HOURS12.map((x) => (
            <button key={x} type="button" className="num" aria-pressed={h12 === x && !typedTime} onClick={() => { setH12(x); setTyped('') }}>{x}</button>
          ))}
        </div>
        <span className="tp-label">الدقائق</span>
        <div className="tp-grid minutes" role="group" aria-label="الدقائق">
          {MINUTES.map((x) => (
            <button key={x} type="button" className="num" aria-pressed={(mi ?? 0) === x && h12 !== null && !typedTime} onClick={() => { setMi(x); setTyped('') }}>{pad(x)}</button>
          ))}
        </div>
        <label className="tp-type">
          <span>أو اكتب الوقت بالضبط</span>
          <input
            className="nf-input num ltr"
            inputMode="numeric"
            placeholder="2:35"
            aria-label="الوقت بالضبط"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (ready) onPick(ready) } }}
          />
        </label>
      </div>
    </Dialog>
  )
}
