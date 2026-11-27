import { Building2, CalendarCheck2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Wallet } from 'lucide-react'
import { PinBoxes, type PinState } from '../ui/PinBoxes'
import { ChamferCard } from '../features/login/ChamferCard'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../app/auth'
import { LoginLogo } from '../features/login/LoginLogo'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { ErrorBanner, Field } from '../ui/Field'
import { Button } from '../ui/primitives'
import { ThemeToggle } from '../ui/ThemeToggle'

const LAST_USER = 'af-last-username'

export function Brand() {
  return (
    <section className="login-brand entry-side">
      <div className="entry-side-bg" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="grain" /></div>
      <div className="entry-side-in">
        <div className="entry-logo"><LoginLogo /></div>
        <h1>نظام إدارة المكاتب والموظفين</h1>
        <p>شركة أبناء فارس أبو زايد للتجارة والاستيراد</p>
        <ul className="login-modules" aria-label="أقسام النظام">
          <li style={{ '--d': '.5s' } as CSSProperties}><span className="em-ico"><Building2 size={19} /></span><span><b>الفروع</b><small>جميع الفروع في نظام واحد</small></span></li>
          <li style={{ '--d': '.58s' } as CSSProperties}><span className="em-ico"><CalendarCheck2 size={19} /></span><span><b>الحضور</b><small>من النظام أو عبر رمز QR</small></span></li>
          <li style={{ '--d': '.66s' } as CSSProperties}><span className="em-ico"><Wallet size={19} /></span><span><b>الرواتب</b><small>دفعات وخصومات وسلف</small></span></li>
          <li style={{ '--d': '.74s' } as CSSProperties}><span className="em-ico"><Mail size={19} /></span><span><b>المراسلات</b><small>بين الموظف والإدارة</small></span></li>
        </ul>
      </div>
      <footer className="entry-footer"><span>© {new Date().getFullYear()} أبناء فارس أبو زايد</span></footer>
    </section>
  )
}

function PasswordInput({ id, value, onChange, autoComplete, disabled }: { id: string; value: string; onChange(v: string): void; autoComplete: string; disabled?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input id={id} className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} dir="ltr" style={{ paddingInlineStart: 52 }} />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'إخفاء الرمز' : 'إظهار الرمز'} style={{ position: 'absolute', insetInlineStart: 6, top: '50%', transform: 'translateY(-50%)' }}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
export { PasswordInput }

export function Login() {
  useDocumentTitle('تسجيل الدخول')
  const { state, signIn, setup } = useAuth()
  const isSetup = state.status === 'setup'
  const [username, setUsername] = useState(() => { try { return localStorage.getItem(LAST_USER) ?? '' } catch { return '' } })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [long, setLong] = useState(false)
  const [pin, setPin] = useState<PinState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const userRef = useRef<HTMLInputElement>(null)
  const sending = useRef(false)

  useEffect(() => { if (!username) userRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(code = password) {
    if (sending.current) return
    if (!username.trim()) { setError('اكتب اسم المستخدم أولاً.'); userRef.current?.focus(); return }
    if (!isSetup && !long && code.length !== 6) return
    sending.current = true
    setBusy(true); setPin('busy'); setError(null); setFields({})
    try {
      if (isSetup) await setup({ name, username, password: code, password_confirmation: password2 })
      else await signIn(username.trim(), code, long ? undefined : async () => {
        setPin('success')
        await new Promise((r) => window.setTimeout(r, 2300))
      })
      try { localStorage.setItem(LAST_USER, username.trim()) } catch { /* not remembered */ }
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields)
        setError(Object.keys(err.fields).length ? null : err.message)
      } else setError('حدث خطأ. حاول مرة أخرى.')
      setPin('error')
      window.setTimeout(() => { setPassword(''); setPin('idle') }, 650)
      setBusy(false)
      sending.current = false
    }
  }

  const verified = pin === 'success'
  return (
    <div className="login entry-page">
      <Brand />
      <span className="entry-divider" aria-hidden="true"><span className="entry-rail"><b /></span><i /></span>
      <div className="entry-main">
        <div className="entry-main-bg" aria-hidden="true" />
        <div className="entry-theme"><ThemeToggle /></div>
        <ChamferCard className="login-card glass lc" verified={verified}>
          <span className="lc-glow" aria-hidden="true" />
          <div className="lc-intro" aria-hidden="true"><i className="lc-ring" /><i className="lc-ring r2" /><span className="lc-emblem"><LockKeyhole size={34} /></span></div>
          <div className="login-card-head">
            <span className="entry-badge" aria-hidden="true">{verified ? <ShieldCheck size={22} /> : <LockKeyhole size={22} />}</span>
            <h2 key={verified ? 'ok' : 'in'}>{isSetup ? 'تجهيز النظام' : verified ? 'تم التحقق بنجاح' : 'تسجيل الدخول'}</h2>
            <p>{isSetup ? 'أول حساب: السوبر أدمن (مسؤول النظام)' : verified ? 'مرحباً بك، جارٍ فتح النظام…' : 'اسم المستخدم ثم رمزك المكوّن من 6 أرقام'}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submit() }} noValidate className="login-form">
            {isSetup && (
              <Field label="الاسم الكامل" error={fields.name}>
                {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" />}
              </Field>
            )}
            {!verified && (
              <Field label="اسم المستخدم" error={fields.username}>
                {(id) => (
                  <input ref={userRef} id={id} name="username" className="input" value={username} disabled={busy} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="auto"
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} />
                )}
              </Field>
            )}
            {long && !isSetup ? (
              <Field label="الرمز" error={fields.password}>
                {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />}
              </Field>
            ) : (
              <div className="field">
                {!verified && <div className="otp-label"><span>{isSetup ? 'رمز الدخول (6 أرقام)' : 'الرمز'}</span>
                  {!isSetup && <button type="button" onClick={() => { setLong(true); setPassword('') }}>رمزي القديم ليس 6 أرقام</button>}</div>}
                <PinBoxes value={password} onChange={(v) => { setPassword(v); if (pin === 'error') setPin('idle'); if (error) setError(null); if (Object.keys(fields).length) setFields({}) }} onComplete={isSetup ? undefined : (v) => void submit(v)}
                  state={pin} celebrate={!isSetup} label="الرمز المكوّن من 6 أرقام" autoFocus={!!username} autoComplete={isSetup ? 'new-password' : 'current-password'} />
                {fields.password && <span className="field-error" role="alert">{fields.password}</span>}
              </div>
            )}
            {isSetup && (
              <div className="field">
                <div className="otp-label"><span>أعد كتابة الرمز</span></div>
                <PinBoxes value={password2} onChange={setPassword2} label="أعد كتابة الرمز" autoComplete="new-password" />
                {fields.password_confirmation && <span className="field-error" role="alert">{fields.password_confirmation}</span>}
              </div>
            )}
            <ErrorBanner text={error} />
            {!verified && (
              <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={!username || (long ? !password : password.length !== 6) || (isSetup && password2.length !== 6)}>
                {isSetup ? 'تجهيز ودخول' : 'دخول'}
              </Button>
            )}
          </form>
        </ChamferCard>
      </div>
    </div>
  )
}
