import { ChoiceField } from '../ui/ChoiceField'
import { KeyRound, Save, UserCog } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import { SCOPE_LABEL, type Override, type PermissionDef, type RoleGrants, type Scope, type User } from '../api/types'
import { useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button } from '../ui/primitives'
import { ScrollTable } from '../ui/ScrollTable'
import { useToast } from '../ui/Toast'

interface Matrix { permissions: PermissionDef[]; roles: RoleGrants[]; scopes: Scope[] }

const groupsOf = (perms: PermissionDef[]) => {
  const out = new Map<string, PermissionDef[]>()
  perms.forEach((p) => out.set(p.group, [...(out.get(p.group) ?? []), p]))
  return [...out.entries()]
}

export function Permissions() {
  const [tab, setTab] = useState<'roles' | 'people'>('roles')
  return (
    <>
      <PageHead title="الصلاحيات" eyebrow="من يطّلع على ماذا، وفي أي فروع" />
      <div className="segmented af-tabs" role="radiogroup" aria-label="نوع الصلاحيات">
        <button type="button" role="radio" aria-checked={tab === 'roles'} onClick={() => setTab('roles')}>حسب الدور</button>
        <button type="button" role="radio" aria-checked={tab === 'people'} onClick={() => setTab('people')}>لشخص معيّن</button>
      </div>
      {tab === 'roles' ? <RolesMatrix /> : <PersonOverrides />}
    </>
  )
}

function RolesMatrix() {
  const { data, error, loading, setData } = useLoad<Matrix>('/permissions')
  const [roleId, setRoleId] = useState('')
  const [blocked, setBlocked] = useState(false)
  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const role = data.roles.find((entry) => String(entry.id) === roleId)
    ?? data.roles.find((entry) => !entry.locked)
    ?? data.roles[0]
  if (!role) return null

  return (
    <section className="card glass af-pad af-permissions">
      <label className="af-permission-picker">
        الدور الوظيفي
        <ChoiceField className="input select" value={role.id} disabled={blocked} onChange={(event) => setRoleId(event.target.value)}>
          {data.roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </ChoiceField>
      </label>
      <RoleEditor key={role.id} role={role} permissions={data.permissions} onSaved={setData} onBlocked={setBlocked} />
    </section>
  )
}

function RoleEditor({ role, permissions, onSaved, onBlocked }: { role: RoleGrants; permissions: PermissionDef[]; onSaved(data: Matrix): void; onBlocked(blocked: boolean): void }) {
  const me = useUser()
  const toast = useToast()
  const [draft, setDraft] = useState(role.grants)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const admin = me.role?.key === 'super_admin'
  const editable = !role.locked && (admin || role.level < (me.role?.level ?? 0))
  const scopeRank: Scope[] = ['own', 'branch', 'all']
  const permitted = (key: string) => admin || !!me.permissions?.[key]
  const changed = permissions.filter(({ key }) => draft[key] !== role.grants[key])
  const dirty = changed.length > 0
  useEffect(() => { onBlocked(dirty || saving) }, [dirty, saving, onBlocked])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const grants = Object.fromEntries(changed.map(({ key }) => [key, draft[key] ?? null]))
      const updated = await api<Matrix>(`/roles/${role.id}/permissions`, { method: 'PATCH', body: { grants } })
      setDraft(updated.roles.find((other) => other.id === role.id)?.grants ?? {})
      onSaved(updated)
      toast(`حُفظت صلاحيات ${role.name}`)
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'تعذّر حفظ الصلاحيات.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <form onSubmit={(event) => { event.preventDefault(); if (dirty && !saving) void save() }}>
        {role.locked ? <p>يملك هذا الدور جميع الصلاحيات تلقائيًا.</p> : (
          <div className="af-permission-groups">
            {groupsOf(permissions).map(([group, items]) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {items.map(({ key, name }) => {
                  const cap = me.permissions?.[key]
                  return (
                    <label className="af-permission-row" key={key}>
                      <span>{name}</span>
                      <ChoiceField className="input select" value={draft[key] ?? ''} disabled={saving || !editable || !permitted(key)}
                        onChange={(event) => {
                          const value = event.target.value as Scope | ''
                          setDraft((current) => {
                            const next = { ...current }
                            if (value) next[key] = value
                            else delete next[key]
                            return next
                          })
                        }}>
                        <option value="">غير ممنوحة</option>
                        {scopeRank.map((scope) => (
                          <option key={scope} value={scope} disabled={!admin && (!cap || scopeRank.indexOf(scope) > scopeRank.indexOf(cap))}>{SCOPE_LABEL[scope]}</option>
                        ))}
                      </ChoiceField>
                    </label>
                  )
                })}
              </fieldset>
            ))}
          </div>
        )}
        <ErrorBanner text={error} />
        {editable && <div className="af-permission-save">
          <span role="status">{dirty ? 'لديك تغييرات غير محفوظة' : 'جميع التغييرات محفوظة'}</span>
          <Button disabled={!dirty || saving} onClick={() => { setDraft(role.grants); setError(null) }}>تراجع</Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!dirty} icon={<Save size={16} />}>حفظ صلاحيات الدور</Button>
        </div>}
      </form>
    </>
  )
}

function PersonOverrides() {
  const toast = useToast()
  const me = useUser()
  const users = useLoad<{ users: User[] }>('/users')
  const matrix = useLoad<Matrix>('/permissions')
  const [userId, setUserId] = useState('')
  const [payload, setPayload] = useState<{ role_grants: Record<string, Scope>; overrides: Override[]; effective: Record<string, Scope> } | null>(null)
  const [draft, setDraft] = useState<Record<string, '' | 'deny' | Scope>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let current = true
    api<NonNullable<typeof payload>>(`/users/${userId}/permissions`).then((p) => {
      if (!current) return
      setPayload(p)
      setDraft(Object.fromEntries(p.overrides.map((o) => [o.key, o.effect === 'deny' ? 'deny' : (o.scope ?? 'branch')])))
    }).catch((e) => {
      if (current) setError(e instanceof ApiError ? e.message : 'تعذّر تحميل صلاحيات الموظف.')
    })
    return () => { current = false }
  }, [userId])

  const admin = me.role?.key === 'super_admin'
  const people = useMemo(() => (users.data?.users ?? []).filter((u) => u.id !== me.id && u.role &&
    u.role.key !== 'super_admin' && (admin || u.role.level < (me.role?.level ?? 0))), [users.data, me, admin])
  const dirty = matrix.data?.permissions.some(({ key }) => {
    const saved = payload?.overrides.find((override) => override.key === key)
    return (draft[key] || '') !== (saved?.effect === 'deny' ? 'deny' : (saved?.scope ?? ''))
  })

  async function save() {
    setBusy(true)
    try {
      const overrides = Object.entries(draft).filter(([key, v]) => v && (admin || me.permissions?.[key])).map(([key, v]) => (v === 'deny' ? { key, effect: 'deny' } : { key, effect: 'allow', scope: v }))
      const p = await api<NonNullable<typeof payload>>(`/users/${userId}/permissions`, { method: 'PUT', body: { overrides } })
      setPayload(p)
      toast('حُفظت الصلاحيات الخاصة')
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'لم يُحفظ', 'danger')
    } finally { setBusy(false) }
  }

  return (
    <div className="card glass af-pad">
      <p className="eyebrow">الاستثناء الشخصي: تمنح الموظف صلاحية إضافية على دوره، أو تمنعه من صلاحية في دوره. والاستثناء مقدَّم على الدور.</p>
      <ChoiceField className="input select" value={userId} disabled={busy} onChange={(e) => { setPayload(null); setDraft({}); setError(null); setUserId(e.target.value) }} aria-label="اختر الموظف" style={{ maxWidth: 420 }}>
        <option value="">اختر الموظف…</option>
        {people.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role?.name}{u.branch ? ` · ${u.branch.name}` : ''}</option>)}
      </ChoiceField>
      <ErrorBanner text={error} />
      {payload && matrix.data && (
        <>
          <div className="af-permission-overrides"><ScrollTable label="الاستثناءات الفردية"><table className="tbl af-matrix">
            <thead><tr><th>الصلاحية</th><th>من دوره</th><th>استثناء</th><th>النتيجة</th></tr></thead>
            <tbody>
              {matrix.data.permissions.map((p) => {
                const fromRole = payload.role_grants[p.key]
                const choice = draft[p.key]
                const result = choice === 'deny' ? null : choice || fromRole
                const cap = me.permissions?.[p.key]
                const rank: Scope[] = ['own', 'branch', 'all']
                return (
                  <tr key={p.key}>
                    <th scope="row">{p.name}</th>
                    <td>{fromRole ? SCOPE_LABEL[fromRole] : '—'}</td>
                    <td>
                      <ChoiceField className="input select af-scope" value={draft[p.key] ?? ''} aria-label={`استثناء ${p.name}`} disabled={busy || (!admin && !cap)} data-on={draft[p.key] || undefined}
                        onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value as '' | 'deny' | Scope }))}>
                        <option value="">بدون استثناء</option>
                        <option value="deny">ممنوع</option>
                        <option value="own" disabled={!admin && (!cap || rank.indexOf('own') > rank.indexOf(cap))}>{SCOPE_LABEL.own}</option>
                        <option value="branch" disabled={!admin && (!cap || rank.indexOf('branch') > rank.indexOf(cap))}>{SCOPE_LABEL.branch}</option>
                        <option value="all" disabled={!admin && (!cap || rank.indexOf('all') > rank.indexOf(cap))}>{SCOPE_LABEL.all}</option>
                      </ChoiceField>
                    </td>
                    <td><b>{result ? SCOPE_LABEL[result] : '—'}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table></ScrollTable></div>
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" busy={busy} disabled={!dirty} icon={<UserCog size={16} />} onClick={() => void save()}>حفظ الاستثناءات</Button>
          </div>
        </>
      )}
      {!userId && <p className="eyebrow" style={{ marginTop: 12 }}><KeyRound size={14} /> لا يظهر السوبر أدمن هنا لأنه يملك جميع الصلاحيات.</p>}
    </div>
  )
}
