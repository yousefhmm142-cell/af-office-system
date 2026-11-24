import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { User } from '../api/types'
import { useAuth } from '../app/auth'
import { ErrorBanner, Field } from '../ui/Field'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { Brand, PasswordInput } from './Login'
import '../styles/login-entry.css'
import { ThemeToggle } from '../ui/ThemeToggle'

/** Used at first sign-in (forced) and from «حسابي». */
export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone?(): void }) {
  const { setUser } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFields({})
    setError(null)
    try {
      const res = await api<{ user: User }>('/me/password', { method: 'POST', body: { current_password: current, password: next, password_confirmation: next2 } })
      toast('تغيّر الرمز. الأجهزة الثانية طلعت من حسابك.')
      setCurrent(''); setNext(''); setNext2('')
      setUser(res.user)
      onDone?.()
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <Field label={forced ? 'الرمز المؤقت اللي أعطوك إياه' : 'الرمز الحالي'} error={fields.current_password}>
        {(id) => <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" disabled={busy} />}
      </Field>
      <Field label="الرمز الجديد" error={fields.password} hint="6 خانات على الأقل">
        {(id) => <PasswordInput id={id} value={next} onChange={setNext} autoComplete="new-password" disabled={busy} />}
      </Field>
      <Field label="أعد كتابة الرمز الجديد" error={fields.password_confirmation}>
        {(id) => <PasswordInput id={id} value={next2} onChange={setNext2} autoComplete="new-password" disabled={busy} />}
      </Field>
      <ErrorBanner text={error} />
      <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<KeyRound size={18} />} disabled={!current || !next || !next2}>
        حفظ الرمز الجديد
      </Button>
    </form>
  )
}

export function ForcedPasswordChange() {
  const { state, signOut } = useAuth()
  const name = state.status === 'signed_in' ? state.user.name : ''
  return (
    <div className="login entry-page">
      <Brand />
      <span className="entry-divider" aria-hidden="true"><span className="entry-rail"><b /></span><i /></span>
      <div className="entry-main">
        <div className="entry-main-bg" aria-hidden="true" />
        <div className="entry-theme"><ThemeToggle /></div>
        <section className="login-card glass">
          <div className="login-card-head">
            <span className="entry-badge" aria-hidden="true"><KeyRound size={22} /></span>
            <h2>أهلاً {name}</h2>
            <p>أول مرة بتدخل: اختار رمز خاص فيك</p>
          </div>
          <ChangePasswordForm forced />
          <button type="button" className="link-btn" onClick={() => void signOut()} style={{ marginTop: 12 }}>تسجيل الخروج</button>
        </section>
      </div>
    </div>
  )
}
