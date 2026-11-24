import { KeyRound, Save, UserCog } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import { SCOPE_LABEL, type Override, type PermissionDef, type RoleGrants, type Scope, type User } from '../api/types'
import { useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button } from '../ui/primitives'
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
      <PageHead title="الصلاحيات" eyebrow="مين بيشوف شو، وبأي فروع" />
      <div className="segmented af-tabs" role="radiogroup" aria-label="نوع الصلاحيات">
        <button type="button" role="radio" aria-checked={tab === 'roles'} onClick={() => setTab('roles')}>حسب الدور</button>
        <button type="button" role="radio" aria-checked={tab === 'people'} onClick={() => setTab('people')}>لشخص معيّن</button>
      </div>
      {tab === 'roles' ? <RolesMatrix /> : <PersonOverrides />}
    </>
  )
}

function ScopeSelect({ value, onChange, disabled, label }: { value: Scope | ''; onChange(v: Scope | ''): void; disabled?: boolean; label: string }) {
  return (
    <select className="input select af-scope" data-on={value || undefined} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value as Scope | '')}>
      <option value="">—</option>
      <option value="own">{SCOPE_LABEL.own}</option>
      <option value="branch">{SCOPE_LABEL.branch}</option>
      <option value="all">{SCOPE_LABEL.all}</option>
    </select>
  )
}

function RolesMatrix() {
  const me = useUser()
  const toast = useToast()
  const { data, error, loading, setData } = useLoad<Matrix>('/permissions')
  const [draft, setDraft] = useState<Record<number, Record<string, Scope>>>({})
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.roles.map((r) => [r.id, { ...r.grants }])))
  }, [data])

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const editable = (r: RoleGrants) => !r.locked && (me.role?.key === 'super_admin' || r.level < (me.role?.level ?? 0))
  const dirty = (r: RoleGrants) => JSON.stringify(Object.entries(draft[r.id] ?? {}).sort()) !== JSON.stringify(Object.entries(r.grants).sort())

  async function save(r: RoleGrants) {
    setSaving(r.id)
    try {
      setData(await api<Matrix>(`/roles/${r.id}/permissions`, { method: 'PUT', body: { grants: draft[r.id] ?? {} } }))
      toast(`انحفظت صلاحيات ${r.name}`)
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'ما انحفظ', 'danger')
    } finally { setSaving(null) }
  }

  return (
    <div className="card glass af-matrix-wrap">
      <table className="tbl af-matrix">
        <thead>
          <tr>
            <th scope="col">الصلاحية</th>
            {data.roles.map((r) => <th key={r.id} scope="col">{r.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {groupsOf(data.permissions).map(([group, perms]) => (
            <Fragment key={group}>
              <tr className="af-group"><th colSpan={data.roles.length + 1} scope="colgroup">{group}</th></tr>
              {perms.map((p) => (
                <tr key={p.key}>
                  <th scope="row">{p.name}</th>
                  {data.roles.map((r) => (
                    <td key={r.id}>
                      <ScopeSelect label={`${p.name} · ${r.name}`} value={draft[r.id]?.[p.key] ?? ''} disabled={!editable(r)}
                        onChange={(v) => setDraft((d) => {
                          const next = { ...(d[r.id] ?? {}) }
                          if (v) next[p.key] = v
                          else delete next[p.key]
                          return { ...d, [r.id]: next }
                        })} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th />
            {data.roles.map((r) => (
              <td key={r.id}>
                {r.locked ? <small className="eyebrow">كل شي دايماً</small> : editable(r) && (
                  <Button variant={dirty(r) ? 'primary' : 'secondary'} busy={saving === r.id} disabled={!dirty(r)} icon={<Save size={15} />} onClick={() => void save(r)}>حفظ</Button>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <p className="eyebrow af-pad">«فرعه» = بيشوف فرعه بس. «كل الفروع» = كل الشركة. «إله بس» = بياناته هو بس.</p>
    </div>
  )
}

function PersonOverrides() {
  const toast = useToast()
  const users = useLoad<{ users: User[] }>('/users')
  const matrix = useLoad<Matrix>('/permissions')
  const [userId, setUserId] = useState('')
  const [payload, setPayload] = useState<{ role_grants: Record<string, Scope>; overrides: Override[]; effective: Record<string, Scope> } | null>(null)
  const [draft, setDraft] = useState<Record<string, '' | 'deny' | Scope>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setPayload(null); return }
    setError(null)
    api<NonNullable<typeof payload>>(`/users/${userId}/permissions`).then((p) => {
      setPayload(p)
      setDraft(Object.fromEntries(p.overrides.map((o) => [o.key, o.effect === 'deny' ? 'deny' : (o.scope ?? 'branch')])))
    }).catch((e) => { setPayload(null); setError(e instanceof ApiError ? e.message : 'صار خطأ') })
  }, [userId])

  const people = useMemo(() => (users.data?.users ?? []).filter((u) => u.role?.key !== 'super_admin'), [users.data])

  async function save() {
    setBusy(true)
    try {
      const overrides = Object.entries(draft).filter(([, v]) => v).map(([key, v]) => (v === 'deny' ? { key, effect: 'deny' } : { key, effect: 'allow', scope: v }))
      const p = await api<NonNullable<typeof payload>>(`/users/${userId}/permissions`, { method: 'PUT', body: { overrides } })
      setPayload(p)
      toast('انحفظت صلاحياته الخاصة')
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'ما انحفظ', 'danger')
    } finally { setBusy(false) }
  }

  return (
    <div className="card glass af-pad">
      <p className="eyebrow">استثناء لشخص: بتعطيه صلاحية زيادة عن دوره، أو بتمنعه من صلاحية بدوره. الاستثناء بيغلب الدور.</p>
      <select className="input select" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="اختار الموظف" style={{ maxWidth: 420 }}>
        <option value="">اختار الموظف…</option>
        {people.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role?.name}{u.branch ? ` · ${u.branch.name}` : ''}</option>)}
      </select>
      <ErrorBanner text={error} />
      {payload && matrix.data && (
        <>
          <table className="tbl af-matrix" style={{ marginTop: 16 }}>
            <thead><tr><th>الصلاحية</th><th>من دوره</th><th>استثناء</th><th>النتيجة</th></tr></thead>
            <tbody>
              {matrix.data.permissions.map((p) => {
                const fromRole = payload.role_grants[p.key]
                const result = payload.effective[p.key]
                return (
                  <tr key={p.key}>
                    <th scope="row">{p.name}</th>
                    <td>{fromRole ? SCOPE_LABEL[fromRole] : '—'}</td>
                    <td>
                      <select className="input select af-scope" value={draft[p.key] ?? ''} aria-label={`استثناء ${p.name}`} data-on={draft[p.key] || undefined}
                        onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value as '' | 'deny' | Scope }))}>
                        <option value="">بدون استثناء</option>
                        <option value="deny">ممنوع</option>
                        <option value="own">{SCOPE_LABEL.own}</option>
                        <option value="branch">{SCOPE_LABEL.branch}</option>
                        <option value="all">{SCOPE_LABEL.all}</option>
                      </select>
                    </td>
                    <td><b>{result ? SCOPE_LABEL[result] : '—'}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" busy={busy} icon={<UserCog size={16} />} onClick={() => void save()}>حفظ الاستثناءات</Button>
          </div>
        </>
      )}
      {!userId && <p className="eyebrow" style={{ marginTop: 12 }}><KeyRound size={14} /> السوبر أدمن ما بيظهر هون لأنه عنده كل شي.</p>}
    </div>
  )
}
