import { CalendarClock, Clock, DatabaseBackup, Download, Droplet, LayoutGrid, Pencil, Plus, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError, getToken } from '../../api/client'
import { config } from '../../config'
import { formatAmount } from '../../lib/numbers'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { NumberField, Segmented, TextField } from '../../ui/form'
import { Skeleton } from '../../ui/fx/Skeleton'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { GeneratorDialog } from '../generation/GeneratorDialog'
import { maintenanceLabel, type FuelType, type Generator, type MaintenancePlan, type MaintenanceType } from '../generation/model'

interface Zone { id: number; name: string; isActive: boolean; sortOrder: number }
interface Setup {
  branch: { id: number; name: string }
  generators: Generator[]
  fuelTypes: FuelType[]
  zones: Zone[]
  maintenancePlan: MaintenancePlan
  lastBackupAt: string | null
  can: { generation: boolean; distribution: boolean }
}

const activeOptions = [{ value: 'on', label: 'فعّال' }, { value: 'off', label: 'موقوف' }] as const
const zoneActiveOptions = [{ value: 'on', label: 'فعّالة' }, { value: 'off', label: 'موقوفة' }] as const
const errorOf = (e: unknown) => (e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ. حاول مرة أخرى.')
const soon = ['حدود التنبيهات والدوامات', 'سجل كل التغييرات']

/** Features planned for the settings, listed last as on the office's old page. */
export function SoonCard() {
  return (
    <section className="card">
      <div className="card-h"><span className="ico-round"><Clock size={16} /></span><h2>تأتي لاحقاً</h2></div>
      <ul className="soon-list">{soon.map((s) => <li key={s}>{s}</li>)}</ul>
    </section>
  )
}

/** The branch's equipment and lists, in the order of the office's settings page. */
export function BranchSetupCards() {
  const { data, error, loading, reload } = useLoad<Setup>('/branch-setup')
  if (error) return <ErrorBanner text={error} />
  if (loading && !data) return <section className="card"><Skeleton kind="list" /></section>
  if (!data) return null
  return (
    <>
      {data.can.generation && <GeneratorsCard list={data.generators} onChanged={reload} />}
      {data.can.distribution && <ZonesCard list={data.zones} onChanged={reload} />}
      {data.can.generation && <FuelTypesCard list={data.fuelTypes} onChanged={reload} />}
      {data.can.generation && <MaintenancePlanCard saved={data.maintenancePlan} />}
      <BackupCard last={data.lastBackupAt} onDone={reload} />
    </>
  )
}

function GeneratorsCard({ list, onChanged }: { list: Generator[]; onChanged(): void }) {
  const [editing, setEditing] = useState<Generator | 'new' | null>(null)
  return (
    <section className="card">
      <div className="card-h">
        <span className="ico-round brand"><Zap size={16} /></span>
        <h2>المولدات</h2>
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')} className="card-h-action">إضافة مولد</Button>
      </div>
      {list.length === 0 ? <p className="card-empty">لا مولدات بعد. أضف أول مولد ليظهر في تقرير اليوم.</p> : (
        <ul className="gen-list">
          {list.map((g) => (
            <li key={g.id}>
              <span className="gen-badge num">{g.sortOrder}</span>
              <span className="gen-main">
                <b>{g.name}</b>
                <small>
                  {g.brand}
                  {g.model && <span className="num ltr"> · {g.model}</span>}
                  {g.capacityKva !== null && <span className="num"> · {formatAmount(g.capacityKva)} kVA</span>}
                  {g.litersPerHour !== null && <span className="num"> · {formatAmount(g.litersPerHour)} لتر/ساعة</span>}
                </small>
              </span>
              {g.isActive ? <Pill tone="ok">فعّال</Pill> : <Pill>موقوف</Pill>}
              <button type="button" className="icon-btn" aria-label={`تعديل ${g.name}`} onClick={() => setEditing(g)}><Pencil size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {editing && <GeneratorDialog generator={editing === 'new' ? null : editing} others={list} onClose={() => setEditing(null)} onSaved={() => onChanged()} />}
    </section>
  )
}

/** The areas the distribution supervisor reports on, in the order of the paper form. */
function ZonesCard({ list, onChanged }: { list: Zone[]; onChanged(): void }) {
  const [editing, setEditing] = useState<Zone | 'new' | null>(null)
  return (
    <section className="card">
      <div className="card-h">
        <span className="ico-round brand"><LayoutGrid size={16} /></span>
        <h2>مناطق التوزيع</h2>
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')} className="card-h-action">إضافة منطقة</Button>
      </div>
      {list.length === 0 ? <p className="card-empty">لا مناطق بعد. أضف المناطق كما في ورقة التوزيع.</p> : (
        <ul className="gen-list">
          {list.map((z) => (
            <li key={z.id}>
              <span className="gen-badge num">{z.sortOrder}</span>
              <span className="gen-main"><b>{z.name}</b></span>
              {z.isActive ? <Pill tone="ok">فعّالة</Pill> : <Pill>موقوفة</Pill>}
              <button type="button" className="icon-btn" aria-label={`تعديل ${z.name}`} onClick={() => setEditing(z)}><Pencil size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <NameDialog
          title={editing === 'new' ? 'إضافة منطقة' : `تعديل ${editing.name}`}
          item={editing === 'new' ? null : editing}
          placeholder="مثل: الصفطاوي"
          options={zoneActiveOptions}
          hint="المنطقة الموقوفة لا تظهر في كشف اليوم."
          emptyText="اكتب اسم المنطقة."
          savedText={editing === 'new' ? 'أُضيفت المنطقة' : 'حُفظ التعديل'}
          save={(name, isActive) => editing === 'new'
            ? api('/distribution/zones', { method: 'POST', body: { name } }).then(async (r) => { if (!isActive) await api(`/distribution/zones/${(r as { id: number }).id}`, { method: 'PATCH', body: { name, isActive } }) })
            : api(`/distribution/zones/${editing.id}`, { method: 'PATCH', body: { name, isActive } })}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  )
}

/** Fuel types listed in the daily generation report. */
function FuelTypesCard({ list, onChanged }: { list: FuelType[]; onChanged(): void }) {
  const [editing, setEditing] = useState<FuelType | 'new' | null>(null)
  return (
    <section className="card">
      <div className="card-h">
        <span className="ico-round brand"><Droplet size={16} /></span>
        <h2>أنواع الوقود</h2>
        <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')} className="card-h-action">إضافة نوع</Button>
      </div>
      {list.length === 0 ? <p className="card-empty">لا أنواع وقود بعد.</p> : (
        <ul className="gen-list">
          {list.map((f) => (
            <li key={f.id}>
              <span className="gen-main"><b>{f.name}</b></span>
              {f.isActive ? <Pill tone="ok">فعّال</Pill> : <Pill>موقوف</Pill>}
              <button type="button" className="icon-btn" aria-label={`تعديل ${f.name}`} onClick={() => setEditing(f)}><Pencil size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <NameDialog
          title={editing === 'new' ? 'إضافة نوع وقود' : `تعديل ${editing.name}`}
          item={editing === 'new' ? null : editing}
          placeholder="مثل: سولار مصري، بنزين"
          options={activeOptions}
          hint="الموقوف لا يظهر في تقرير اليوم."
          emptyText="اكتب اسم نوع الوقود."
          savedText={editing === 'new' ? 'أُضيف نوع الوقود' : 'حُفظ التعديل'}
          save={(name, isActive) => api('/generation/equipment/fuel', { method: 'POST', body: { id: editing === 'new' ? undefined : editing.id, name, isActive } })}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </section>
  )
}

function NameDialog({ title, item, placeholder, options, hint, emptyText, savedText, save, onClose, onSaved }: {
  title: string
  item: { name: string; isActive: boolean } | null
  placeholder: string
  options: ReadonlyArray<{ value: 'on' | 'off'; label: string }>
  hint: string
  emptyText: string
  savedText: string
  save(name: string, isActive: boolean): Promise<unknown>
  onClose(): void
  onSaved(): void
}) {
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [active, setActive] = useState<'on' | 'off'>(item?.isActive === false ? 'off' : 'on')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return setError(emptyText)
    setBusy(true)
    try {
      await save(name.trim(), active === 'on')
      toast(savedText)
      onSaved()
      onClose()
    } catch (e) {
      setError(errorOf(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => void submit()}>حفظ</Button></>}>
      <div className="form-grid">
        <TextField label="الاسم" value={name} onChange={setName} placeholder={placeholder} />
        <div className="field">
          <span className="label">الحالة</span>
          <Segmented<'on' | 'off'> label="الحالة" value={active} options={options} onChange={setActive} />
          <span className="field-hint">{hint}</span>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}

const KINDS: Array<{ kind: MaintenanceType; by: 'hours' | 'days' }> = [
  { kind: 'oil_filter', by: 'hours' },
  { kind: 'fuel_filter', by: 'hours' },
  { kind: 'air_filter', by: 'hours' },
  { kind: 'cooling', by: 'days' },
  { kind: 'battery', by: 'days' },
  { kind: 'belt', by: 'days' },
]

/** How often each maintenance is due (the schedule on the generation report reads it). */
function MaintenancePlanCard({ saved }: { saved: MaintenancePlan }) {
  const toast = useToast()
  const [plan, setPlan] = useState<MaintenancePlan>(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => setPlan(saved), [saved])

  async function save() {
    setBusy(true)
    try {
      const clean: MaintenancePlan = {}
      for (const { kind, by } of KINDS) {
        const v = plan[kind]?.[by]
        if (v && v > 0) clean[kind] = { [by]: Math.round(v) }
      }
      await api('/branch-setup/maintenance-plan', { method: 'PUT', body: { plan: clean } })
      toast('حُفظ جدول الصيانة')
    } catch (e) {
      toast(errorOf(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-h">
        <span className="ico-round brand"><CalendarClock size={16} /></span>
        <h2>جدول صيانة المولدات</h2>
        <Button variant="primary" busy={busy} onClick={() => void save()} className="card-h-action">حفظ</Button>
      </div>
      <p className="muted mp-note">كل كم ساعة تشغيل أو كل كم يوم يجب أن تُجرى كل صيانة. الخانة الفارغة تعني بلا موعد. لتغيير الزيت إعداده الخاص (250 ساعة).</p>
      <div className="mp-form">
        {KINDS.map(({ kind, by }) => (
          <NumberField key={kind} label={maintenanceLabel(kind)} unit={by === 'hours' ? 'ساعة' : 'يوم'} decimal={false} max={10000}
            value={plan[kind]?.[by] ?? null}
            onChange={(v) => setPlan((p) => ({ ...p, [kind]: v ? { [by]: v } : undefined }))} />
        ))}
      </div>
    </section>
  )
}

/** One file with everything the branch wrote, to keep somewhere safe. */
function BackupCard({ last, onDone }: { last: string | null; onDone(): void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null

  async function download() {
    setBusy(true)
    try {
      const res = await fetch(`${config.apiBase}/branch-setup/backup`, { headers: { Authorization: `Bearer ${getToken() ?? ''}`, Accept: 'application/json' } })
      if (!res.ok) throw new Error('failed')
      const name = /filename="?([^";]+)/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'backup.json'
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      toast('نُزّلت النسخة الاحتياطية')
      onDone()
    } catch {
      toast('تعذّر تنزيل النسخة. حاول مرة أخرى.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-h">
        <span className="ico-round brand"><DatabaseBackup size={16} /></span>
        <h2>النسخة الاحتياطية</h2>
        <Button variant="primary" icon={<Download size={16} />} busy={busy} onClick={() => void download()} className="card-h-action">تنزيل نسخة الآن</Button>
      </div>
      <p className="muted mp-note">ملف واحد فيه تقارير الفرع وكشوفه وموظفوه. نزّله مرة في الأسبوع واحفظه في مكان آمن.</p>
      <div className="af-backup-state">
        {days === null ? <Pill tone="warn">لم تُنزَّل أي نسخة بعد</Pill>
          : days === 0 ? <Pill tone="ok">آخر نسخة اليوم</Pill>
          : <Pill tone={days > 7 ? 'warn' : 'ok'}>{`آخر نسخة قبل ${days} ${days === 1 ? 'يوم' : days <= 10 ? 'أيام' : 'يوماً'}`}</Pill>}
      </div>
    </section>
  )
}
