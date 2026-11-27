import { AccountHandoff } from './AccountHandoff'
import { ChoiceField } from '../ui/ChoiceField'
import { BranchDepartments, BranchRoster } from './BranchPlanning'
import { CalendarCheck, CalendarClock, ClipboardList, LayoutGrid, MessageSquare, Pencil, Plus, Stamp, Trash2, UserRound, Users, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { NxAvatar, NxCard, NxEmpty, type Hue } from '../ui/nx'
import { Crumbs } from '../ui/Crumbs'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { api, ApiError } from '../api/client'
import { DAYS, type Branch, type Schedule, type User } from '../api/types'
import { can, scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { TimeField } from '../ui/TimeField'
import { Loading } from '../ui/PageHead'
import { Button } from '../ui/primitives'
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

  const team = (staff.data?.users ?? []).filter((u) => u.is_active)
  return (
    <div className="nx nxbd">
      <Crumbs trail={[{ label: 'الفروع', to: '/branches' }, { label: `فرع ${branch.name}` }]} />
      <section className="nx-hero">
        <div className="nx-hero-cover"><span>فرع</span></div>
        <div className="nx-hero-main">
          <div className="nx-hero-photo"><NxAvatar name={branch.name} size={96} /></div>
          <div className="nx-hero-id">
            <h1>{branch.name}</h1>
            <p>{branch.manager ? <>مدير الفرع: <b>{branch.manager.name}</b></> : 'لم يُحدَّد مدير للفرع'}</p>
            <div className="nx-hero-meta">
              <span><Users size={15} /> <span className="num">{branch.users_count}</span> مستخدماً</span>
              <span><LayoutGrid size={15} /> <span className="num">{branch.modules.filter((m) => m.enabled).length}</span> من {branch.modules.length} أقسام مفتوحة</span>
              <span><CalendarClock size={15} /> <span className="num">{schedules.length}</span> {schedules.length === 1 ? 'دوام' : 'دوامات'}</span>
            </div>
          </div>
          <div className="nx-hero-side">
            <span className="nx-chip nx-chip-dot" data-hue={branch.is_active ? 'mint' : 'amber'}>{branch.is_active ? 'فعّال' : 'موقوف'}</span>
            {can(me, 'users.manage') && ['hr', 'super_admin'].includes(me.role?.key ?? '') && <div className="nx-hero-actions"><AccountHandoff branchId={String(branch.id)} /></div>}
          </div>
        </div>
      </section>

      <div className="nx-split">
        <NxCard title="أقسام الفرع" icon={<LayoutGrid size={17} />}>
          <p className="nxw-hint">القسم المغلق لا يظهر لموظفي الفرع.</p>
          <div className="nxbd-mods">
            {branch.modules.map((m) => (
              <label key={m.key} className="nxbd-mod" data-on={m.enabled || undefined} data-busy={busyModule === m.key || undefined}>
                <span className="nx-ico" data-hue={m.enabled ? MOD_HUE[m.key] ?? 'violet' : 'slate'}>{MOD_ICON[m.key] ?? <LayoutGrid size={18} />}</span>
                <span className="nxbd-mod-t"><b>{m.name}</b><small>{m.enabled ? 'مفتوح' : 'مغلق'}</small></span>
                <input type="checkbox" className="nxbd-switch" checked={m.enabled} disabled={!manageBranch || busyModule === m.key} onChange={(e) => void toggleModule(m.key, e.target.checked)} aria-label={m.name} />
              </label>
            ))}
          </div>
        </NxCard>
        <NxCard title="مدير الفرع والفريق" icon={<UserRound size={17} />}>
          <div className="nxbd-manager">
            <NxAvatar name={branch.manager?.name ?? '؟'} size={52} />
            <div>
              {manageBranch ? (
                <ChoiceField className="input select" value={branch.manager?.id ?? ''} onChange={(e) => void setManager(e.target.value)} aria-label="مدير الفرع">
                  <option value="">— بدون مدير —</option>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role?.name})</option>)}
                </ChoiceField>
              ) : <b>{branch.manager?.name ?? 'بدون مدير'}</b>}
              <small>يُختار من موظفي الفرع فقط.</small>
            </div>
          </div>
          {team.length > 0 && <div className="nxbd-team">
            <div className="nxbd-faces">{team.slice(0, 9).map((u) => <Link key={u.id} to={`/employees/${u.id}`} title={u.name}><NxAvatar name={u.name} size={38} /></Link>)}{team.length > 9 && <span className="nxbd-more num">+{team.length - 9}</span>}</div>
            <Link to="/users" className="nx-edit">كل الموظفين</Link>
          </div>}
        </NxCard>
      </div>

      <NxCard title="الدوامات" icon={<CalendarClock size={17} />} action={manageSchedules && <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>دوام جديد</Button>}>
        {schedules.length > 0 ? (
          <div className="nxbd-shifts">
            {schedules.map((sch) => (
              <article key={sch.id} className="nxbd-shift" data-default={sch.is_default || undefined}>
                <header>
                  <b>{sch.name}</b>
                  {sch.is_default && <span className="nx-chip" data-hue="rose">الأساسي</span>}
                  {manageSchedules && <span className="nxbd-shift-act">
                    <button type="button" className="nx-icon-btn" aria-label={`تعديل ${sch.name}`} onClick={() => setEditing(sch)}><Pencil size={15} /></button>
                    {!sch.is_default && <button type="button" className="nx-icon-btn" aria-label={`حذف ${sch.name}`} onClick={() => void removeSchedule(sch)}><Trash2 size={15} /></button>}
                  </span>}
                </header>
                <strong className="num nxbd-hours"><bdi dir="ltr">{sch.start_time} – {sch.end_time}</bdi></strong>
                <div className="nxbd-days">{DAYS.map(([d, n]) => <span key={d} data-on={sch.work_days.includes(d) || undefined} title={n}>{n.replace(/^ال/, '').slice(0, 2)}</span>)}</div>
                <small>سماح التأخير <b className="num">{sch.grace_minutes}</b> دقيقة · {dayNames(sch.work_days)}</small>
              </article>
            ))}
          </div>
        ) : <NxEmpty icon={<CalendarClock size={26} />} title="لا توجد دوامات لهذا الفرع" />}
      </NxCard>
      {can(me, 'departments.manage') && <BranchDepartments key={branch.id} branch={branch.id} />}
      {manageSchedules && <BranchRoster key={branch.id} branch={branch.id} staff={staff.data?.users ?? []} schedules={schedules} />}
      {editing && <ScheduleDialog branchId={branch.id} schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
    </div>
  )
}

const MOD_ICON: Record<string, React.ReactNode> = {
  attendance: <CalendarCheck size={18} />, generation: <Zap size={18} />, distribution: <LayoutGrid size={18} />,
  tasks: <ClipboardList size={18} />, seals: <Stamp size={18} />, sms: <MessageSquare size={18} />,
}
const MOD_HUE: Record<string, Hue> = { attendance: 'mint', generation: 'amber', distribution: 'sky', tasks: 'violet', seals: 'rose', sms: 'sky' }

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
