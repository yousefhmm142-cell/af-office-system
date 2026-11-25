import { MapPin, Plus, Tags } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner, Switch } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import type { Options } from './lib'

/** The kinds of task and the branch's areas: add with one line, switch off what is no longer used. */
export function TaskSettings() {
  const me = useUser()
  const [params, setParams] = useSearchParams()
  const all = scopeOf(me, 'tasks.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const branchId = all
    ? params.get('branch_id') || String(me.branch?.id ?? branches.data?.branches[0]?.id ?? '')
    : String(me.branch?.id ?? '')
  const toast = useToast()
  const { data, error, loading, reload } = useLoad<Options>(branchId ? `/tasks/options?branch_id=${branchId}` : null)
  const [typeName, setTypeName] = useState('')
  const [zoneName, setZoneName] = useState('')

  async function call(path: string, method: string, body: unknown, successMessage: string) {
    try {
      await api(path, { method, body })
      toast(successMessage)
      void reload()
      return true
    } catch (error) {
      toast(error instanceof ApiError ? (Object.values(error.fields)[0] ?? error.message) : 'تعذّر الحفظ.', 'danger')
      return false
    }
  }

  async function addType(event: FormEvent) {
    event.preventDefault()
    if (typeName.trim() && await call('/task-types', 'POST', { name: typeName.trim(), branch_id: Number(branchId) }, 'أُضيف النوع')) {
      setTypeName('')
    }
  }

  async function addZone(event: FormEvent) {
    event.preventDefault()
    if (zoneName.trim() && await call('/zones', 'POST', { name: zoneName.trim(), branch_id: Number(branchId) }, 'أُضيفت المنطقة')) {
      setZoneName('')
    }
  }

  return (
    <>
      <PageHead title="أنواع المهام والمناطق" eyebrow="ما يظهر عند إنشاء مهمة جديدة" />
      {all && <div className="af-toolbar">
        <select className="input select" aria-label="الفرع" value={branchId} onChange={(e) => setParams({ branch_id: e.target.value })}>
          <option value="" disabled>اختر الفرع</option>
          {branches.data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </div>}
      <ErrorBanner text={error ?? branches.error} />
      {branchId && loading && <Loading />}
      {branchId && data && !loading && !error && <div className="af-grid2">
        <section className="card glass af-pad">
          <h2 className="af-h2"><Tags size={18} /> أنواع المهام</h2>
          <form className="af-add-line" onSubmit={addType}><input className="input" value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="نوع جديد، مثال: تركيب عداد ذكي" aria-label="نوع جديد" /><Button type="submit" icon={<Plus size={16} />} disabled={!typeName.trim()}>إضافة</Button></form>
          <div className="rows">
            {data?.types.map((t) => (
              <div key={t.id} className="row af-kv">
                <span className="row-label">{t.name}<small className="af-sub">{t.branch_id ? 'لهذا الفرع' : 'لكل الفروع'}</small></span>
                {(t.branch_id || me.role?.key === 'super_admin') && <Switch label={t.is_active ? 'مفعّل' : 'متوقف'} on={t.is_active} onChange={(v) => void call(`/task-types/${t.id}`, 'PATCH', { is_active: v }, 'حُفظ')} />}
              </div>
            ))}
          </div>
        </section>
        <section className="card glass af-pad">
          <h2 className="af-h2"><MapPin size={18} /> المناطق</h2>
          <form className="af-add-line" onSubmit={addZone}><input className="input" value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="منطقة جديدة، مثال: المخيم الجديد" aria-label="منطقة جديدة" /><Button type="submit" icon={<Plus size={16} />} disabled={!zoneName.trim()}>إضافة</Button></form>
          <div className="rows">
            {data?.zones.map((z) => (
              <div key={z.id} className="row af-kv"><span className="row-label">{z.name}</span><Switch label={z.is_active ? 'مفعّلة' : 'متوقفة'} on={z.is_active} onChange={(v) => void call(`/zones/${z.id}`, 'PATCH', { is_active: v }, 'حُفظ')} /></div>
            ))}
            {data?.zones.length === 0 && <p className="eyebrow">لا توجد مناطق بعد.</p>}
          </div>
        </section>
      </div>}
    </>
  )
}
