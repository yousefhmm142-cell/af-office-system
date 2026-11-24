import { Building2, Plus, UserRound, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { Branch } from '../api/types'
import { scopeOf, useUser } from '../app/auth'
import { useLoad } from '../lib/useLoad'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button, Pill } from '../ui/primitives'
import { useToast } from '../ui/Toast'

export function Branches() {
  const user = useUser()
  const { data, error, loading, reload } = useLoad<{ branches: Branch[] }>('/branches')
  const [adding, setAdding] = useState(false)
  const canAdd = scopeOf(user, 'branches.manage') === 'all'

  return (
    <>
      <PageHead title="الفروع" eyebrow="كل فرع إله موظفينه وأقسامه ودوامه"
        actions={canAdd && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setAdding(true)}>فرع جديد</Button>} />
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : (
        <div className="af-cards">
          {data?.branches.map((b) => (
            <Link key={b.id} to={`/branches/${b.id}`} className="card glass af-card">
              <div className="af-card-top">
                <span className="ico-round"><Building2 size={20} /></span>
                <b>{b.name}</b>
                {!b.is_active && <Pill tone="warn">موقوف</Pill>}
              </div>
              <div className="af-meta">
                <span><Users size={15} /> <b className="num">{b.users_count}</b> مستخدم</span>
                <span><UserRound size={15} /> {b.manager?.name ?? 'بدون مدير'}</span>
              </div>
              <div className="af-mods">
                {b.modules.filter((m) => m.enabled).map((m) => <span key={m.key} className="af-tag">{m.name}</span>)}
              </div>
            </Link>
          ))}
          {data?.branches.length === 0 && <p className="eyebrow">لسا ما في فروع. اضغط «فرع جديد».</p>}
        </div>
      )}
      <NewBranch open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void reload() }} />
    </>
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
      toast(`انضاف فرع ${name}`)
      setName('')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="فرع جديد" subtitle="كل الأقسام بتكون مفتوحة، وبتقدر تسكّر اللي بدك ياه بعدين" icon={<Building2 size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={save} disabled={!name}>إضافة</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="اسم الفرع" error={fields.name}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مخيم 2" />}</Field>
        <div className="af-row2">
          <Field label="بداية الدوام" error={fields.start_time}>{(id) => <input id={id} className="input num" type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="عدد الساعات" error={fields.work_hours}>{(id) => <input id={id} className="input num" type="number" min={1} max={16} value={hours} onChange={(e) => setHours(e.target.value)} />}</Field>
        </div>
        <ErrorBanner text={error} />
      </form>
    </Dialog>
  )
}
