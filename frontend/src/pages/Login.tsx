import '../styles/login-entry.css'
import { Building2, CalendarCheck2, Eye, EyeOff, LockKeyhole, Mail, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
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
          <li style={{ '--d': '.5s' } as CSSProperties}><span className="em-ico"><Building2 size={19} /></span><span><b>الفروع</b><small>كل الفروع بنظام واحد</small></span></li>
          <li style={{ '--d': '.58s' } as CSSProperties}><span className="em-ico"><CalendarCheck2 size={19} /></span><span><b>الحضور</b><small>من النظام أو بالـQR</small></span></li>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => { userRef.current?.focus() }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      if (isSetup) await setup({ name, username, password, password_confirmation: password2 })
      else await signIn(username, password)
      try { localStorage.setItem(LAST_USER, username.trim()) } catch { /* not remembered */ }
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields)
        setError(Object.keys(err.fields).length ? null : err.message)
      } else setError('صار خطأ. جرّب كمان مرة.')
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <div className="login entry-page">
      <Brand />
      <span className="entry-divider" aria-hidden="true"><span className="entry-rail"><b /></span><i /></span>
      <div className="entry-main">
        <div className="entry-main-bg" aria-hidden="true" />
        <div className="entry-theme"><ThemeToggle /></div>
        <section className="login-card glass">
          <div className="login-card-head">
            <span className="entry-badge" aria-hidden="true"><LockKeyhole size={22} /></span>
            <h2>{isSetup ? 'تجهيز النظام' : 'تسجيل الدخول'}</h2>
            <p>{isSetup ? 'أول حساب: السوبر أدمن (مسؤول النظام)' : 'باسم المستخدم والرمز'}</p>
          </div>
          <form onSubmit={onSubmit} noValidate className="login-form">
            {isSetup && (
              <Field label="الاسم الكامل" error={fields.name}>
                {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" />}
              </Field>
            )}
            <Field label="اسم المستخدم" error={fields.username}>
              {(id) => (
                <input ref={userRef} id={id} name="username" className="input" value={username} disabled={busy} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="auto"
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} />
              )}
            </Field>
            <Field label="الرمز" error={fields.password} hint={isSetup ? '6 خانات على الأقل' : undefined}>
              {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete={isSetup ? 'new-password' : 'current-password'} disabled={busy} />}
            </Field>
            {isSetup && (
              <Field label="أعد كتابة الرمز" error={fields.password_confirmation}>
                {(id) => <PasswordInput id={id} value={password2} onChange={setPassword2} autoComplete="new-password" disabled={busy} />}
              </Field>
            )}
            <ErrorBanner text={error} />
            <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={!username || !password}>
              {isSetup ? 'تجهيز ودخول' : 'دخول'}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
