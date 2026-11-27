import { Check, Lock } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'

export type PinState = 'idle' | 'busy' | 'error' | 'success'
const SIZE = 6

/**
 * Six boxes for a six-digit code. One real input underneath takes typing, paste and the phone's
 * number pad; the boxes only draw it. On success a light runs round their edges, they slide onto
 * one another into a single box, and it turns green with a check.
 */
export function PinBoxes({ value, onChange, onComplete, state = 'idle', label, autoFocus, celebrate = false, successText = 'تم التحقق والدخول بأمان', id, autoComplete = 'current-password' }: {
  value: string; onChange(v: string): void; onComplete?(v: string): void; state?: PinState; label: string; autoFocus?: boolean
  celebrate?: boolean; successText?: string; id?: string; autoComplete?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])
  useEffect(() => { if (state === 'error') input.current?.focus() }, [state])

  const set = (raw: string) => {
    const digits = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '').slice(0, SIZE)
    onChange(digits)
    if (digits.length === SIZE) onComplete?.(digits)
  }
  const locked = state === 'busy' || state === 'success'
  const stage = celebrate && state === 'success' ? 'win' : state

  return (
    <div className="otp" data-state={stage} onClick={() => input.current?.focus()}>
      <div className="otp-ring">
        <div className="otp-row" dir="ltr">
          {Array.from({ length: SIZE }, (_, i) => {
            const filled = i < value.length
            const active = !locked && i === Math.min(value.length, SIZE - 1) && value.length < SIZE
            return (
              <span key={i} className="otp-box" data-filled={filled || undefined} data-active={active || undefined}
                style={{ '--i': i, '--dx': `calc((${i} - ${(SIZE - 1) / 2}) * (var(--otp-w) + var(--otp-gap)))` } as CSSProperties}>
                {filled ? <span className="otp-digit">{value[i]}</span> : active ? <i className="otp-caret" /> : null}
              </span>
            )
          })}
        </div>
      </div>
      {celebrate && (
        <div className="otp-win" aria-hidden={state !== 'success'}>
          <span className="otp-seal"><Check size={26} strokeWidth={3} /></span>
          <span className="otp-win-t">{successText} <Lock size={14} /></span>
        </div>
      )}
      <input ref={input} id={id} className="otp-input" inputMode="numeric" pattern="[0-9]*" autoComplete={autoComplete} aria-label={label}
        value={value} maxLength={SIZE} disabled={locked} onChange={(e) => set(e.target.value)} onPaste={(e) => { e.preventDefault(); set(e.clipboardData.getData('text')) }} />
    </div>
  )
}
