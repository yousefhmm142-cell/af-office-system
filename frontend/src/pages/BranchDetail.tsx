import { BranchDepartments, BranchRoster } from './BranchPlanning'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { api, ApiError } from '../api/client'
import { DAYS, type Branch, type Schedule, type User } from '../api/types'
import { can, scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { ScrollTable } from '../ui/ScrollTable'
import { TimeField } from '../ui/TimeField'
import { Loading, PageHead } from '../ui/PageHead'
import { Button, Pill } from '../ui/primitives'
import { useToast } from '../ui/Toast'

const dayNames = (days: number[]) =>
  days.length === 7 ? 'طوال الأسبوع (بما فيه الجمعة)' : DAYS.filter(([d]) => days.includes(d)).map(([, n]) => n).join('، ')

export function BranchDetail() {
  const { id } = useParams()
  const me = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload, setData } = useLoad<{ branch: Branch; schedules: Schedule[] }>(`/branches/${id}`)
  const staff = useLoad<{ users: User[] }>(can(me, 'users.view') ? `/users?branch_id=${id}` : null)
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  const [busyModule, setBusyModule] = useState<string | null>(null)

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const { branch, schedules } = data
  const manageBranch = scopeOf(me, 'branches.manage') === 'all' || (scopeOf(me, 'branches.manage') === 'branch' && me.branch?.id === branch.id)
  const manageSchedules = scopeOf(me, 'schedules.manage') === 'all' || (scopeOf(me, 'schedules.manage') === 'branch' && me.branch?.id === branch.id)

  async function toggleModule(key: string, on: boolean) {
    setBusyModule(key)
    try {
      const res = await api<{ branch: Branch }>(`/branches/${branch.id}/modules`, { method: 'PUT', body: { modules: { [key]: on } } })
      setData({ branch: res.branch, schedules })
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'لم يُحفظ', 'danger')
    } finally { setBusyModule(null) }
  }

  async function setManager(userId: string) {
    try {
      const res = await api<{ branch: Branch }>(`/branches/${branch.id}`, { method: 'PATCH', body: { manager_user_id: userId ? Number(userId) : null } })
      setData({ branch: res.branch, schedules })
      toast('حُفظ مدير الفرع')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحفظ', 'danger') }
  }

  async function removeSchedule(s: Schedule) {
    if (!(await confirm({ title: `حذف دوام «${s.name}»؟`, danger: true, confirmLabel: 'حذف' }))) return
    try {
      await api(`/schedules/${s.id}`, { method: 'DELETE' })
      toast('حُذف الدوام')
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحذف', 'danger') }
  }

  return (
    <>
      <PageHead title={branch.name} eyebrow="الفرع" actions={!branch.is_active && <Pill tone="warn">موقوف</Pill>} />
      <div className="af-grid2">
        <section className="card glass af-pad">
          <h2 className="af-h2">أقسام الفرع</h2>
          <p className="eyebrow">القسم المغلق لا يظهر لموظفي الفرع.</p>
          <div className="af-switches">
            {branch.modules.map((m) => (
              <Switch key={m.key} label={m.name} on={m.enabled} disabled={!manageBranch || busyModule === m.key} onChange={(v) => void toggleModule(m.key, v)} />
            ))}
          </div>
        </section>
        <section className="card glass af-pad">
          <h2 className="af-h2">مدير الفرع</h2>
          {manageBranch ? (
            <select className="input select" value={branch.manager?.id ?? ''} onChange={(e) => void setManager(e.target.value)} aria-label="مدير الفرع">
              <option value="">— بدون مدير —</option>
              {staff.data?.users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role?.name})</option>)}
            </select>
          ) : <p><b>{branch.manager?.name ?? 'بدون مدير'}</b></p>}
          <p className="eyebrow" style={{ marginTop: 10 }}>تظهر هنا أسماء موظفي الفرع فقط. <b className="num">{branch.users_count}</b> مستخدماً في الفرع.</p>
        </section>
      </div>

      <section className="card glass af-pad" style={{ marginTop: 16 }}>
        <div className="af-row-between">
          <h2 className="af-h2"><CalendarClock size={18} /> الدوامات</h2>
          {manageSchedules && <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>دوام جديد</Button>}
        </div>
        {schedules.length > 0 ? (
          <ScrollTable label="دوامات الفرع">
            <table className="tbl af-schedule-table">
              <thead><tr><th scope="col">الدوام</th><th scope="col">أيام العمل</th><th scope="col">الساعات</th><th scope="col">السماح</th>{manageSchedules && <th scope="col">الإجراءات</th>}</tr></thead>
              <tbody>{schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <th scope="row">{schedule.name} {schedule.is_default && <Pill tone="brand" dot={false}>الأساسي</Pill>}</th>
                  <td>{dayNames(schedule.work_days)}</td>
                  <td><bdi className="num" dir="ltr">{schedule.start_time} – {schedule.end_time}</bdi></td>
                  <td>{schedule.grace_minutes} دقيقة</td>
                  {manageSchedules && <td><span className="af-row-actions">
                    <button type="button" className="icon-btn" aria-label={`تعديل ${schedule.name}`} onClick={() => setEditing(schedule)}><Pencil size={16} /></button>
                    {!schedule.is_default && <button type="button" className="icon-btn" aria-label={`حذف ${schedule.name}`} onClick={() => void removeSchedule(schedule)}><Trash2 size={16} /></button>}
                  </span></td>}
                </tr>
              ))}</tbody>
            </table>
          </ScrollTable>
        ) : <p className="eyebrow">لا توجد دوامات لهذا الفرع.</p>}
      </section>
      {can(me, 'departments.manage') && <BranchDepartments key={branch.id} branch={branch.id} />}
      {manageSchedules && <BranchRoster key={branch.id} branch={branch.id} staff={staff.data?.users ?? []} schedules={schedules} />}
      {editing && <ScheduleDialog branchId={branch.id} schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
    </>
  )
}

function ScheduleDialog({ branchId, schedule, onClose, onSaved }: { branchId: number; schedule: Schedule | null; onClose(): void; onSaved(): void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: schedule?.name ?? '',
    start_time: schedule?.start_time ?? '08:00',
    end_time: schedule?.end_time ?? '16:00',
    overnight: !!schedule && schedule.end_time < schedule.start_time,
    grace_minutes: String(schedule?.grace_minutes ?? 10),
    work_days: schedule?.work_days ?? [1, 2, 3, 4, 5, 6, 7],
    is_default: schedule?.is_default ?? false,
  })
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true); setFields({}); setError(null)
    const body = { ...form, grace_minutes: Number(form.grace_minutes) }
    try {
      if (schedule) await api(`/schedules/${schedule.id}`, { method: 'PATCH', body })
      else await api('/schedules', { method: 'POST', body: { ...body, branch_id: branchId } })
      toast('حُفظ الدوام')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={schedule ? 'تعديل دوام' : 'دوام جديد'} icon={<CalendarClock size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => void save()}>حفظ</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="اسم الدوام" error={fields.name}>{(id) => <input id={id} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: الدوام العادي" />}</Field>
        <div className="af-row2">
          <Field label="البداية" error={fields.start_time}>{(id) => <TimeField id={id} label="بداية الدوام" value={form.start_time} onChange={(value) => set('start_time', value)} />}</Field>
          <Field label="النهاية" error={fields.end_time}>{(id) => <TimeField id={id} label="نهاية الدوام" value={form.end_time} onChange={(value) => set('end_time', value)} />}</Field>
        </div>
        <Switch label="الانصراف في اليوم التالي" on={form.overnight} onChange={v => set('overnight', v)} />
        <Field label="دقائق السماح للتأخير" error={fields.grace_minutes}>{(id) => <input id={id} className="input num" type="number" min={0} max={120} value={form.grace_minutes} onChange={(e) => set('grace_minutes', e.target.value)} />}</Field>
        <div className="field">
          <label>أيام الدوام</label>
          <div className="chips">
            {DAYS.map(([d, n]) => (
              <button key={d} type="button" className="chip" aria-pressed={form.work_days.includes(d)}
                onClick={() => set('work_days', form.work_days.includes(d) ? form.work_days.filter((x) => x !== d) : [...form.work_days, d])}>{n}</button>
            ))}
          </div>
          {fields.work_days && <span className="field-error">{fields.work_days}</span>}
        </div>
        <Switch label="الدوام الأساسي للفرع" on={form.is_default} onChange={(v) => set('is_default', v)} />
        <ErrorBanner text={error} />
      </form>
    </Dialog>
  )
}
