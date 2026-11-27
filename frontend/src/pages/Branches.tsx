import { ArrowLeft, Building2, CalendarCheck, ClipboardList, LayoutGrid, MessageSquare, Plus, Search, Stamp, UserRound, Users, Zap } from 'lucide-react'
import { NxAvatar, NxDonut, NxEmpty, NxStat } from '../ui/nx'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { Branch } from '../api/types'
import { scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'

type Today = { id: number; staff: number; present: number | null; late: number | null; not_in: number | null; open_tasks: number | null; late_tasks: number; done_today: number | null }
const MODULE_ICON: Record<string, React.ReactNode> = {
  attendance: <CalendarCheck size={15} />, generation: <Zap size={15} />, distribution: <LayoutGrid size={15} />,
  tasks: <ClipboardList size={15} />, seals: <Stamp size={15} />, sms: <MessageSquare size={15} />,
}

export function Branches() {
  const user = useUser()
  const { data, error, loading, reload } = useLoad<{ branches: Branch[] }>('/branches')
  const today = useLoad<{ branches: Today[] }>('/dashboard')
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const canAdd = scopeOf(user, 'branches.manage') === 'all'
  const byId = new Map((today.data?.branches ?? []).map((t) => [t.id, t]))
  const list = (data?.branches ?? []).filter((b) => !q.trim() || b.name.includes(q.trim()))
  const staff = (data?.branches ?? []).reduce((n, b) => n + b.users_count, 0)
  const present = [...byId.values()].reduce((n, t) => n + (t.present ?? 0), 0)
  const expected = [...byId.values()].reduce((n, t) => n + (t.present !== null ? t.staff : 0), 0)
  const openTasks = [...byId.values()].reduce((n, t) => n + (t.open_tasks ?? 0), 0)
  const lateTasks = [...byId.values()].reduce((n, t) => n + (t.late_tasks ?? 0), 0)

  return (
    <div className="nx nxb">
      <PageHead title="الفروع" eyebrow="كل فرع: موظفوه، وحضوره اليوم، ومهامه، وأقسامه"
        actions={canAdd && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setAdding(true)}>فرع جديد</Button>} />
      <div className="nx-stats">
        <NxStat icon={<Building2 size={19} />} hue="violet" label="الفروع" value={data?.branches.length ?? '—'} sub={`${(data?.branches ?? []).filter((b) => b.is_active).length} فعّال`} />
        <NxStat icon={<Users size={19} />} hue="sky" label="الموظفون" value={staff} sub="في كل الفروع" />
        <NxStat icon={<CalendarCheck size={19} />} hue="mint" label="حضروا اليوم" value={expected ? present : '—'} unit={expected ? `من ${expected}` : undefined} sub={expected ? `${Math.round((present / expected) * 100)}% نسبة الحضور` : 'لا بيانات حضور'} />
        <NxStat icon={<ClipboardList size={19} />} hue="amber" label="مهام مفتوحة" value={openTasks} sub={lateTasks ? `${lateTasks} متأخرة عن وقتها` : 'لا مهام متأخرة'} />
      </div>
      {(data?.branches.length ?? 0) > 6 && <label className="nxm-search nxb-search"><Search size={17} aria-hidden="true" /><input placeholder="ابحث عن فرع" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث عن فرع" /></label>}
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : (
        <div className="nxb-grid">
          {list.map((b) => {
            const t = byId.get(b.id)
            const pct = t && t.present !== null && t.staff ? Math.round((t.present / t.staff) * 100) : null
            return (
              <Link key={b.id} to={`/branches/${b.id}`} className="nxb-card" data-off={!b.is_active || undefined}>
                <div className="nxb-head">
                  <NxAvatar name={b.name} size={52} />
                  <span className="nxb-title"><b>{b.name}</b><small><UserRound size={13} /> {b.manager?.name ?? 'بدون مدير'}</small></span>
                  {!b.is_active ? <span className="nx-chip" data-hue="amber">موقوف</span> : <ArrowLeft size={18} className="nxb-go" />}
                </div>
                <div className="nxb-today">
                  {pct !== null ? <>
                    <NxDonut size={74} parts={[{ value: t!.present! - (t!.late ?? 0), hue: 'mint' }, { value: t!.late ?? 0, hue: 'amber' }, { value: t!.not_in ?? 0, hue: 'slate' }]} center={`${pct}%`} />
                    <dl>
                      <div><dt>حضروا</dt><dd className="num">{t!.present} <small>من {t!.staff}</small></dd></div>
                      <div><dt>متأخرون</dt><dd className="num" data-warn={(t!.late ?? 0) > 0 || undefined}>{t!.late ?? 0}</dd></div>
                      {t!.open_tasks !== null && <div><dt>مهام مفتوحة</dt><dd className="num" data-warn={t!.late_tasks > 0 || undefined}>{t!.open_tasks}{t!.late_tasks ? <small> · {t!.late_tasks} متأخرة</small> : null}</dd></div>}
                    </dl>
                  </> : <p className="nxb-nodata"><Users size={16} /> <b className="num">{b.users_count}</b> مستخدماً · لا يُسجَّل الحضور في هذا الفرع</p>}
                </div>
                <div className="nxb-mods">
                  {b.modules.map((m) => <span key={m.key} data-on={m.enabled || undefined} title={`${m.name}${m.enabled ? '' : ' (مغلق)'}`}>{MODULE_ICON[m.key] ?? <LayoutGrid size={15} />}</span>)}
                  <small className="num">{b.users_count} مستخدم</small>
                </div>
              </Link>
            )
          })}
          {data?.branches.length === 0 && <div className="nx-card"><NxEmpty icon={<Building2 size={26} />} title="لا توجد فروع بعد" text="اضغط «فرع جديد» لإضافة أول فرع." /></div>}
        </div>
      )}
      <NewBranch open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void reload() }} />
    </div>
  )
}

function NewBranch({ open, onClose, onSaved }: { open: boolean; onClose(): void; onSaved(): void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [start, setStart] = useState('08:00')
  const [hours, setHours] = useState('8')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setFields({}); setError(null)
    try {
      await api('/branches', { method: 'POST', body: { name, start_time: start, work_hours: Number(hours) } })
      toast(`أُضيف فرع ${name}`)
      setName('')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="فرع جديد" subtitle="تكون جميع الأقسام مفعّلة، ويمكنك إغلاق ما تريد لاحقاً" icon={<Building2 size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={save} disabled={!name}>إضافة</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="اسم الفرع" error={fields.name}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مخيم 2" />}</Field>
        <div className="af-row2">
          <Field label="بداية الدوام" error={fields.start_time}>{(id) => <input id={id} className="input num" type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="عدد الساعات" error={fields.work_hours}>{(id) => <input id={id} className="input num" type="number" min={1} max={16} value={hours} onChange={(e) => setHours(e.target.value)} />}</Field>
        </div>
        <ErrorBanner text={error} />
      </form>
    </Dialog>
  )
}
