import { KeyRound, Lock, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import { STATUS_LABEL, type Branch, type Role, type User } from '../api/types'
import { can, scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Avatar, Button, Pill } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { PasswordInput } from './Login'

/** A short temporary code the manager reads out; the person changes it at first sign-in. */
function tempPassword() {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return String(100000 + ((n[0] ?? 0) % 900000))
}

export function Users() {
  const me = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useLoad<{ users: User[] }>('/users')
  const branches = useLoad<{ branches: Branch[] }>(can(me, 'branches.view') ? '/branches' : null)
  const roles = useLoad<{ roles: Role[] }>('/roles')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const manages = can(me, 'users.manage')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.users ?? []).filter((u) =>
      (!q || u.name.toLowerCase().includes(q) || u.username.includes(q)) && (!branchFilter || String(u.branch?.id ?? 'none') === branchFilter))
  }, [data, search, branchFilter])

  const canTouch = (u: User) => manages && u.id !== me.id && (me.role?.key === 'super_admin' || (u.role?.level ?? 0) < (me.role?.level ?? 0))
    && (scopeOf(me, 'users.manage') === 'all' || u.branch?.id === me.branch?.id)

  async function toggleActive(u: User) {
    const stop = u.is_active
    if (stop && !(await confirm({ title: `إيقاف حساب ${u.name}؟`, message: 'لن يتمكن من الدخول، وسيُسجَّل خروجه من جميع أجهزته فوراً. ويمكنك إعادة تفعيله في أي وقت.', confirmLabel: 'إيقاف', danger: true }))) return
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { is_active: !stop } })
      toast(stop ? 'أُوقف الحساب' : 'أُعيد تفعيل الحساب')
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحفظ', 'danger') }
  }

  async function remove(u: User) {
    if (!(await confirm({ title: `حذف ${u.name}؟`, message: 'يبقى اسم المستخدم محجوزاً ولا يُعطى لشخص آخر.', confirmLabel: 'حذف', danger: true }))) return
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' })
      toast('تم الحذف')
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحذف', 'danger') }
  }

  return (
    <>
      <PageHead title="الموظفين" eyebrow="لكل موظف حساب: اسم مستخدم ورمز"
        actions={manages && <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => setEditing('new')}>حساب جديد</Button>} />
      <div className="af-toolbar">
        <div className="af-search">
          <Search size={17} aria-hidden="true" />
          <input className="input" placeholder="ابحث بالاسم أو اسم المستخدم" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث" />
        </div>
        {(branches.data?.branches.length ?? 0) > 1 && (
          <select className="input select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="الفرع">
            <option value="">كل الفروع</option>
            <option value="none">الإدارة العامة</option>
            {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : (
        <div className="card glass rows">
          {list.map((u) => (
            <div key={u.id} className="row af-user">
              <Avatar name={u.name} />
              <Link to={u.id === me.id ? '/me' : `/employees/${u.id}`} className="row-label af-link">
                {u.name}
                <small className="af-sub"><span dir="auto">@{u.username}</span> · {u.job_title ?? u.role?.name}{u.branch ? ` · ${u.branch.name}` : ''}</small>
              </Link>
              <span className="af-badges">
                {u.status && u.status !== 'active' && <Pill tone={u.status === 'terminated' ? 'danger' : u.status === 'trainee' ? 'info' : 'warn'}>{STATUS_LABEL[u.status]}</Pill>}
                {!u.is_active && u.status !== 'terminated' && <Pill tone="warn">الحساب موقوف</Pill>}
                {u.is_locked && <Pill tone="danger"><Lock size={12} /> مقفل</Pill>}
                {u.must_change_password && u.is_active && <Pill tone="info">لم يدخل بعد</Pill>}
              </span>
              {canTouch(u) && (
                <span className="af-row-actions">
                  <button type="button" className="icon-btn" title="تعديل" aria-label={`تعديل ${u.name}`} onClick={() => setEditing(u)}><Pencil size={16} /></button>
                  <button type="button" className="icon-btn" title="رمز مؤقت" aria-label={`رمز مؤقت لـ${u.name}`} onClick={() => setResetting(u)}><KeyRound size={16} /></button>
                  <Switch label={u.is_active ? 'فعّال' : 'موقوف'} on={u.is_active} onChange={() => void toggleActive(u)} />
                  <button type="button" className="icon-btn" title="حذف" aria-label={`حذف ${u.name}`} onClick={() => void remove(u)}><Trash2 size={16} /></button>
                </span>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="eyebrow af-pad">لا توجد نتائج.</p>}
        </div>
      )}
      {editing && (
        <UserDialog user={editing === 'new' ? null : editing} roles={roles.data?.roles ?? []} branches={branches.data?.branches ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />
      )}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); void reload() }} />}
    </>
  )
}

function UserDialog({ user, roles, branches, onClose, onSaved }: { user: User | null; roles: Role[]; branches: Branch[]; onClose(): void; onSaved(): void }) {
  const me = useUser()
  const toast = useToast()
  const assignable = roles.filter((r) => r.assignable || r.id === user?.role?.id)
  const [form, setForm] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    password: user ? '' : tempPassword(),
    role_id: String(user?.role?.id ?? assignable.find((r) => r.key === 'employee')?.id ?? ''),
    branch_id: String(user?.branch?.id ?? (scopeOf(me, 'users.manage') === 'branch' ? me.branch?.id ?? '' : '')),
  })
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const role = roles.find((r) => String(r.id) === form.role_id)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true); setFields({}); setError(null)
    const body: Record<string, unknown> = { name: form.name, username: form.username, role_id: Number(form.role_id), branch_id: form.branch_id ? Number(form.branch_id) : null }
    try {
      if (user) {
        await api(`/users/${user.id}`, { method: 'PATCH', body })
        toast('تم الحفظ')
        onSaved()
      } else {
        const res = await api<{ user: User }>('/users', { method: 'POST', body: { ...body, password: form.password } })
        setCreated({ username: res.user.username, password: form.password })
      }
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally { setBusy(false) }
  }

  if (created) {
    return (
      <Dialog open onClose={onSaved} title="تم إنشاء الحساب" icon={<Plus size={20} />} footer={<Button variant="primary" onClick={onSaved}>حسناً</Button>}>
        <p>سلّم الموظف هذه البيانات. وعند دخوله الأول سيطلب منه النظام اختيار رمز خاص به.</p>
        <div className="af-credentials">
          <div><small>اسم المستخدم</small><b dir="auto">{created.username}</b></div>
          <div><small>الرمز المؤقت</small><b className="num" dir="ltr">{created.password}</b></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open onClose={onClose} title={user ? `تعديل ${user.name}` : 'حساب جديد'} icon={<UserPlus size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => void save()}>حفظ</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="الاسم الكامل" error={fields.name}>{(id) => <input id={id} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label="اسم المستخدم" error={fields.username} hint="دون مسافات. مثال: ahmad.h أو احمد_حسن">
          {(id) => <input id={id} className="input" dir="auto" autoCapitalize="none" spellCheck={false} value={form.username} onChange={(e) => set('username', e.target.value.replace(/\s/g, ''))} />}
        </Field>
        {!user && (
          <Field label="الرمز المؤقت" error={fields.password} hint="يُسلَّم للموظف، ويغيّره عند دخوله الأول">
            {(id) => <PasswordInput id={id} value={form.password} onChange={(v) => set('password', v)} autoComplete="new-password" />}
          </Field>
        )}
        <div className="af-row2">
          <Field label="الدور" error={fields.role_id}>
            {(id) => (
              <select id={id} className="input select" value={form.role_id} onChange={(e) => set('role_id', e.target.value)}>
                {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="الفرع" error={fields.branch_id} hint={role && !role.needs_branch ? 'اتركه فارغاً إذا كان يعمل على جميع الفروع' : undefined}>
            {(id) => (
              <select id={id} className="input select" value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} disabled={scopeOf(me, 'users.manage') === 'branch'}>
                {!role?.needs_branch && <option value="">— كل الفروع —</option>}
                {role?.needs_branch && !form.branch_id && <option value="">اختر الفرع</option>}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        <ErrorBanner text={error} />
      </form>
    </Dialog>
  )
}

function ResetDialog({ user, onClose, onSaved }: { user: User; onClose(): void; onSaved(): void }) {
  const toast = useToast()
  const [password, setPassword] = useState(tempPassword)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await api(`/users/${user.id}/reset-password`, { method: 'POST', body: { password } })
      toast(`الرمز المؤقت لـ${user.name}: ${password}`)
      onSaved()
    } catch (e) { setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'لم يُحفظ') } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={`رمز مؤقت لـ${user.name}`} subtitle="يفتح الحساب إن كان مقفلاً، ويسجّل خروجه من جميع أجهزته" icon={<KeyRound size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => void save()}>حفظ</Button></>}>
      <Field label="الرمز المؤقت">{(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />}</Field>
      <ErrorBanner text={error} />
    </Dialog>
  )
}
