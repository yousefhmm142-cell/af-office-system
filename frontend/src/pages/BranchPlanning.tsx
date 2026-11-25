import { useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Schedule, User } from '../api/types'
import { addDays, describeDay, todayISO } from '../lib/dates'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { weekStart } from './attendance/WeekSheet'

type Department = { id: number; name: string; is_active: boolean }
type Day = { date: string; value: string; previous: string; version: string; label: string | null }

export function BranchDepartments({ branch }: { branch: number }) {
  const all = useLoad<{ departments: Department[] }>('/departments')
  const assigned = useLoad<{ departments: Department[] }>(`/departments?branch_id=${branch}`)
  const [choice, choose] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  async function assign() {
    setBusy(true)
    try {
      if (choice === 'new') {
        await api('/departments', { method: 'POST', body: { name: name.trim(), branch_id: branch } })
        await all.reload()
        setName('')
      } else {
        await api(`/branches/${branch}/departments/${choice}`, { method: 'PUT' })
      }
      await assigned.reload()
      choose('')
      toast('أُضيف القسم إلى الفرع')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'danger') }
    finally { setBusy(false) }
  }
  return <section className="card glass af-pad">
    <h2 className="af-h2">الأقسام الوظيفية للفرع</h2>
    <p>{assigned.data?.departments.map(d => d.name).join('، ') || 'لم تُحدّد أقسام بعد'}</p>
    <ErrorBanner text={all.error || assigned.error} />
    <div className="af-toolbar"><select className="input select" aria-label="القسم الوظيفي" value={choice} onChange={e => choose(e.target.value)}>
      <option value="">اختر القسم</option><option value="new">إنشاء قسم جديد</option>{all.data?.departments.filter(d => d.is_active && !assigned.data?.departments.some(a => a.id === d.id)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>{choice === 'new' && <input className="input" aria-label="اسم القسم الجديد" value={name} onChange={e => setName(e.target.value)} placeholder="اسم القسم الجديد" />}<Button disabled={!choice || (choice === 'new' && name.trim().length < 2)} busy={busy} onClick={assign}>إضافة إلى الفرع</Button></div>
  </section>
}

export function BranchRoster({ branch, staff, schedules }: { branch: number; staff: User[]; schedules: Schedule[] }) {
  const [user, select] = useState('')
  const [start, setStart] = useState(() => weekStart(todayISO()))
  return <section className="card glass af-pad">
    <h2 className="af-h2">مناوبات الموظفين</h2>
    <div className="af-toolbar"><select className="input select" aria-label="موظف المناوبة" value={user} onChange={e => select(e.target.value)}>
      <option value="">اختر الموظف</option>{staff.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select><Button onClick={() => setStart(addDays(start, -7))}>الأسبوع السابق</Button><bdi>{start}</bdi><Button onClick={() => setStart(addDays(start, 7))}>الأسبوع التالي</Button></div>
    {user && <RosterWeek key={branch + '/' + user + '/' + start} path={`/branches/${branch}/roster/${user}`} start={start} schedules={schedules} />}
  </section>
}

function RosterWeek({ path, start, schedules }: { path: string; start: string; schedules: Schedule[] }) {
  const { data, error, reload } = useLoad<{ today: string; days: Day[] }>(`${path}?start=${start}`)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const editable = data?.days.filter(d => d.date >= data.today) ?? []
  async function save() {
    setBusy(true)
    try {
      await api(path, { method: 'PUT', body: { days: editable.filter(d => d.date in changes && changes[d.date] !== d.value).map(d => ({ date: d.date, version: d.version, value: changes[d.date] || null })) } })
      await reload()
      setChanges({})
      toast('حُفظت المناوبات')
    } catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] || e.message : 'تعذّر حفظ المناوبات', 'danger') }
    finally { setBusy(false) }
  }
  return <><ErrorBanner text={error} />{data && <fieldset disabled={busy} className="form-grid">
    {data.days.map(d => <label key={d.date}>{describeDay(d.date).weekday} · {d.date}
      <select className="input select" disabled={d.date < data.today} value={changes[d.date] ?? d.value} onChange={e => setChanges({ ...changes, [d.date]: e.target.value })}>
        <option value="">جدول الموظف الأساسي</option><option value="rest">راحة أسبوعية</option>
        {schedules.map(s => <option key={s.id} value={s.id}>{String(s.id) === d.value && d.label ? d.label : `${s.name} (${s.start_time} – ${s.end_time})`}</option>)}
        {d.value && d.value !== 'rest' && !schedules.some(s => String(s.id) === d.value) && <option value={d.value}>{d.label || 'مناوبة مؤرشفة'}</option>}
      </select></label>)}
    <div className="af-toolbar"><Button disabled={!editable.length} onClick={() => setChanges(Object.fromEntries(editable.map(d => [d.date, d.previous])))}>نسخ الأسبوع السابق</Button>
    <Button variant="primary" busy={busy} disabled={!editable.some(d => d.date in changes && changes[d.date] !== d.value)} onClick={save}>حفظ المناوبات</Button></div>
  </fieldset>}</>
}
