import { AccountHandoff } from './AccountHandoff'
import { salaryLabel } from '../api/types'
import { ChoiceField } from '../ui/ChoiceField'
import { KeyRound, Lock, Pencil, Plus, Power, Search, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, ApiError } from '../api/client'
import { SALARY_TYPES, type Schedule, STATUS_LABEL, type Branch, type Role, type User } from '../api/types'
import { can, scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Avatar, Button, Pill } from '../ui/primitives'
import { ScrollTable } from '../ui/ScrollTable'
import { useToast } from '../ui/Toast'
import { PasswordInput } from './Login'

/** A short temporary code the manager reads out; the person changes it at first sign-in. */
function tempPassword() {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return String(100000 + ((n[0] ?? 0) % 900000))
}

export function Users({ embedded = false }: { embedded?: boolean }) {
  const me = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useLoad<{ users: User[] }>('/users')
  const branches = useLoad<{ branches: Branch[] }>(can(me, 'branches.view') ? '/branches' : null)
  const roles = useLoad<{ roles: Role[] }>('/roles')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [filters, setFilters] = useSearchParams()
  const incompleteOnly = filters.get('profile') === 'incomplete'
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const manages = can(me, 'users.manage')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.users ?? []).filter((u) =>
      (!q || u.name.toLowerCase().includes(q) || u.username.includes(q)) && (!branchFilter || String(u.branch?.id ?? 'none') === branchFilter)
      && (!incompleteOnly || (u.is_active && u.needs_profile_completion)))
  }, [data, search, branchFilter, incompleteOnly])

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

  const selectedBranch = branchFilter || (branches.data?.branches.length === 1 ? String(branches.data.branches[0]!.id) : '')
  const create = manages && <Button variant="primary" icon={<UserPlus size={18} />} disabled={!roles.data} onClick={() => setEditing('new')}>حساب جديد</Button>
  const dialogs = (
    <>
      {editing && (
        <UserDialog user={editing === 'new' ? null : editing} roles={roles.data?.roles ?? []} branches={branches.data?.branches ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />
      )}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); void reload() }} />}
    </>
  )

  // Inside the branch settings: the team as one list, like the office's old settings page.
  if (embedded) {
    const people = [...(data?.users ?? [])].sort((a, b) => (b.role?.level ?? 0) - (a.role?.level ?? 0) || a.name.localeCompare(b.name, 'ar'))
    return (
      <>
        <div className="card-h">
          <span className="ico-round brand"><UsersIcon size={16} /></span>
          <h2>الفريق وحسابات الدخول</h2>
          {manages && <Button variant="primary" icon={<Plus size={17} />} disabled={!roles.data} onClick={() => setEditing('new')} className="card-h-action">إضافة موظف</Button>}
        </div>
        <ErrorBanner text={error} />
        {loading && !data ? <Loading /> : people.length === 0 ? <p className="card-empty">لا يوجد موظفون بعد. أضف أول موظف في الفرع.</p> : (
          <ul className="gen-list team-admin">
            {people.map((u) => (
              <li key={u.id} data-off={!u.is_active || undefined}>
                <Link to={u.id === me.id ? '/me' : `/employees/${u.id}`} aria-label={`ملف ${u.name}`}><Avatar name={u.name} size={36} /></Link>
                <span className="gen-main">
                  <b>{u.name}</b>
                  <small>{[u.job_title || u.role?.name, u.job_title ? u.role?.name : null].filter(Boolean).join(' · ')} · <span className="num ltr">@{u.username}</span></small>
                </span>
                {!u.is_active ? <Pill>موقوف</Pill>
                  : u.is_locked ? <Pill tone="danger"><Lock size={12} /> مقفل</Pill>
                  : u.must_change_password ? <Pill tone="info">كلمة مرور مؤقتة</Pill>
                  : u.status === 'trainee' ? <Pill tone="info">متدرب</Pill>
                  : <Pill tone="ok">يدخل بحسابه</Pill>}
                {u.needs_profile_completion && u.is_active && <Pill tone="warn">ملف غير مكتمل</Pill>}
                {canTouch(u) && <>
                  <button type="button" className="icon-btn" aria-label={`تعديل ${u.name}`} title="تعديل" onClick={() => setEditing(u)}><Pencil size={16} /></button>
                  <button type="button" className="icon-btn" aria-label={`رمز مؤقت لـ${u.name}`} title="رمز مؤقت" onClick={() => setResetting(u)}><KeyRound size={16} /></button>
                  <button type="button" className="icon-btn" aria-label={u.is_active ? `إيقاف ${u.name}` : `تفعيل ${u.name}`} title={u.is_active ? 'إيقاف الحساب' : 'إعادة التفعيل'} onClick={() => void toggleActive(u)}><Power size={16} /></button>
                  <button type="button" className="icon-btn danger-btn" aria-label={`حذف ${u.name}`} title="حذف" onClick={() => void remove(u)}><Trash2 size={16} /></button>
                </>}
              </li>
            ))}
          </ul>
        )}
        {dialogs}
      </>
    )
  }

  return (
    <>
      <PageHead title="الموظفون" eyebrow="الحسابات والملفات الشخصية" actions={create} />
      <div className="af-toolbar">
        <div className="af-search">
          <Search size={17} aria-hidden="true" />
          <input className="input" placeholder="ابحث بالاسم أو اسم المستخدم" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث" />
        </div>
        {(branches.data?.branches.length ?? 0) > 1 && (
          <ChoiceField className="input select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="الفرع">
            <option value="">كل الفروع</option>
            <option value="none">الإدارة العامة</option>
            {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </ChoiceField>
        )}
        {selectedBranch && selectedBranch!=='none' && manages && scopeOf(me, 'users.manage') === 'all' && <AccountHandoff key={selectedBranch} branchId={selectedBranch}/>}
        <ChoiceField className="input select" value={incompleteOnly ? 'incomplete' : ''} aria-label="حالة الملف الشخصي"
          onChange={(event) => setFilters(event.target.value ? { profile: event.target.value } : {}, { replace: true })}>
          <option value="">جميع الملفات</option>
          <option value="incomplete">ملفات تحتاج إلى استكمال</option>
        </ChoiceField>
      </div>
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : (
        <div className="card glass af-directory">
          <ScrollTable label="الموظفون">
            <table className="tbl">
              <thead><tr><th scope="col">الموظف</th><th scope="col">الدور والفرع</th><th scope="col">الحالة</th>{manages && <th scope="col">الإجراءات</th>}</tr></thead>
              <tbody>{list.map((u) => (
                <tr key={u.id}>
                  <th scope="row">
                    <Link to={u.id === me.id ? '/me' : `/employees/${u.id}`} className="af-directory-name af-link">
                      <Avatar name={u.name} /><span>{u.name}<small className="af-sub" dir="auto">@{u.username}</small></span>
                    </Link>
                  </th>
                  <td>{u.role?.name ?? '—'}<small className="af-sub">{[u.branch?.name ?? 'الإدارة العامة', u.job_title].filter(Boolean).join(' · ')}</small></td>
                  <td><span className="af-badges">
                    {u.is_active && u.status === 'active' && <Pill tone="ok">فعّال</Pill>}
                    {u.status && u.status !== 'active' && <Pill tone={u.status === 'terminated' ? 'danger' : u.status === 'trainee' ? 'info' : 'warn'}>{STATUS_LABEL[u.status]}</Pill>}
                    {!u.is_active && u.status !== 'terminated' && <Pill tone="warn">الحساب موقوف</Pill>}
                    {u.is_locked && <Pill tone="danger"><Lock size={12} /> مقفل</Pill>}
                    {u.must_change_password && u.is_active && <Pill tone="info">كلمة مرور مؤقتة</Pill>}
                    {u.needs_profile_completion && <Pill tone="warn">ملف شخصي غير مكتمل</Pill>}
                  </span></td>
                  {manages && <td>{canTouch(u) ? (
                    <span className="af-row-actions">
                      <button type="button" className="icon-btn" title="تعديل" aria-label={`تعديل ${u.name}`} onClick={() => setEditing(u)}><Pencil size={16} /></button>
                      <button type="button" className="icon-btn" title="رمز مؤقت" aria-label={`رمز مؤقت لـ${u.name}`} onClick={() => setResetting(u)}><KeyRound size={16} /></button>
                      <Switch label={u.is_active ? 'فعّال' : 'موقوف'} on={u.is_active} onChange={() => void toggleActive(u)} />
                      <button type="button" className="icon-btn" title="حذف" aria-label={`حذف ${u.name}`} onClick={() => void remove(u)}><Trash2 size={16} /></button>
                    </span>
                  ) : '—'}</td>}
                </tr>
              ))}</tbody>
            </table>
          </ScrollTable>
          {list.length === 0 && <p className="eyebrow af-pad">لا توجد نتائج.</p>}
        </div>
      )}
      {dialogs}
    </>
  )
}

function UserDialog({ user, roles, branches, onClose, onSaved }: { user: User | null; roles: Role[]; branches: Branch[]; onClose(): void; onSaved(): void }) {
  const me = useUser()
  const toast = useToast()
  const assignable = roles.filter((r) => r.assignable || r.id === user?.role?.id)
  const [form, setForm] = useState({
    name: user?.name ?? '',
    department_name:'', department_id: '', salary_type: '', salary_amount: '', work_schedule_id: '',
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

  const hiring = !user && role?.key === 'employee' && !!form.branch_id && can(me, 'employees.manage')
  const typeDepartment = can(me, 'departments.manage')
  const departments = useLoad<{ departments: { id: number; name: string; is_active: boolean }[] }>(hiring ? `/departments?branch_id=${form.branch_id}` : null)
  const schedules = useLoad<{ schedules: Schedule[] }>(hiring && can(me, 'schedules.view') ? `/schedules?branch_id=${form.branch_id}` : null)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true); setFields({}); setError(null)
    const body: Record<string, unknown> = { name: form.name, username: form.username, role_id: Number(form.role_id), branch_id: form.branch_id ? Number(form.branch_id) : null }
    if (hiring) Object.assign(body, { ...(typeDepartment ? {department_name:form.department_name.trim()} : {department_id:form.department_id}), salary_type: form.salary_type, salary_amount: form.salary_amount || null, work_schedule_id: form.work_schedule_id || null })
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
        <p>سلّم الموظف هذه البيانات. سيختار كلمة مرور خاصة به عند أول دخول، ثم يستكمل ملفه الشخصي.</p>
        <div className="af-credentials">
          <div><small>اسم المستخدم</small><b dir="auto">{created.username}</b></div>
          <div><small>الرمز المؤقت</small><b className="num" dir="ltr">{created.password}</b></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open onClose={onClose} title={user ? `تعديل ${user.name}` : 'حساب جديد'} icon={<UserPlus size={20} />}
      aside={<>
        <h3>ملخص الحساب</h3>
        <div className="aside-big">{form.name.trim() || 'حساب جديد'}</div>
        <div className="aside-box">
          <div className="aside-row"><span>اسم المستخدم</span><b dir="auto">{form.username || '—'}</b></div>
          <div className="aside-row"><span>الدور</span><b>{role?.name ?? '—'}</b></div>
          <div className="aside-row"><span>الفرع</span><b>{branches.find(b => String(b.id) === form.branch_id)?.name ?? (form.branch_id ? me.branch?.name : role?.needs_branch ? 'اختر الفرع' : 'كل الفروع')}</b></div>
          {hiring && <div className="aside-row"><span>القسم</span><b>{form.department_name || departments.data?.departments.find(d => String(d.id) === form.department_id)?.name || 'اختر القسم'}</b></div>}
        </div>
        {!user && <p className="aside-note">يستكمل الموظف ملفه الشخصي بعد دخوله الأول.</p>}
      </>}
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
              <ChoiceField id={id} className="input select" value={form.role_id} onChange={(e) => set('role_id', e.target.value)}>
                {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </ChoiceField>
            )}
          </Field>
          <Field label="الفرع" error={fields.branch_id} hint={role && !role.needs_branch ? 'اتركه فارغاً إذا كان يعمل على جميع الفروع' : undefined}>
            {(id) => (
              <ChoiceField id={id} className="input select" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value, department_id: '', department_name:'', work_schedule_id: '' })} disabled={scopeOf(me, 'users.manage') === 'branch'}>
                {!role?.needs_branch && <option value="">— كل الفروع —</option>}
                {role?.needs_branch && !form.branch_id && <option value="">اختر الفرع</option>}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </ChoiceField>
            )}
          </Field>
        </div>
        {hiring && <>
          {typeDepartment ? <Field label="قسم الموظف" error={fields.department_name} hint="اكتب اسم القسم. يُضاف إلى الفرع عند حفظ الحساب.">{id=><>
            <input className="input" id={id} maxLength={60} value={form.department_name} onChange={e=>set('department_name',e.target.value)} placeholder="مثلاً: التحصيل الميداني"/>
            <div className="chips">{departments.data?.departments.filter(d=>d.is_active && d.name.includes(form.department_name.trim()) && d.name!==form.department_name.trim()).map(d=><button key={d.id} type="button" className="chip" onClick={()=>set('department_name',d.name)}>{d.name}</button>)}</div>
          </>}</Field> : <Field label="قسم الموظف" error={fields.department_id} hint="تُحدّد الأقسام الوظيفية من صفحة الفرع">{id => <ChoiceField id={id} className="input select" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
            <option value="">اختر القسم</option>{!departments.loading && departments.data?.departments.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</ChoiceField>}</Field>}
          <Field label="نوع الراتب" error={fields.salary_type}>{id => <ChoiceField id={id} className="input select" value={form.salary_type} onChange={e => set('salary_type', e.target.value)}>
            <option value="">اختر نوع الراتب</option>{SALARY_TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</ChoiceField>}</Field>
          <Field label={salaryLabel(form.salary_type)} error={fields.salary_amount} hint="تسجّل شؤون الموظفين المبلغ المتفق عليه. يلزم تحديده قبل تجهيز أول دفعة.">{id => <input className="input" id={id} type="number" min="0" step="0.01" value={form.salary_amount} onChange={e=>set('salary_amount',e.target.value)} />}</Field>
          <Field label="الدوام الأساسي" error={fields.work_schedule_id}>{id => <ChoiceField id={id} className="input select" value={form.work_schedule_id} onChange={e => set('work_schedule_id', e.target.value)}>
            <option value="">الأساسي للفرع</option>{!schedules.loading && schedules.data?.schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</ChoiceField>}</Field>
          <ErrorBanner text={departments.error || schedules.error} />
        </>}
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
