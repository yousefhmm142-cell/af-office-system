import { Droplet, Send, Wrench, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { config } from '../../config'
import { clock12 } from '../../lib/format'
import { formatAmount } from '../../lib/numbers'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { dayName } from '../attendance/lib'
import { Stepper } from '../sheets/Stepper'
import { FuelStep, MaintenanceStep, NotesField, RunsStep, type Update } from './EntrySteps'
import { FuelTable } from './FuelTable'
import { applyAutoFigures, isEditableStatus, maintenanceLabel, missingItems, newReport, reconcileReport, statusInfo, type FuelType, type Generator, type SheetStatus, type SiteReport } from './model'
import '../../styles/generation.css'

type SavedReport = SiteReport & { version: number }
interface GenerationData {
  branch_name: string
  report: SavedReport | null
  previous: SavedReport | null
  fuel_types: FuelType[]
  generators: Generator[]
  history: { report_date: string; status: SheetStatus }[]
  can: { fill: boolean; approve: boolean }
}

const steps = [
  { key: 'fuel', label: 'المحروقات', icon: Droplet },
  { key: 'runs', label: 'التشغيل', icon: Zap },
  { key: 'maintenance', label: 'الصيانات', icon: Wrench },
  { key: 'submit', label: 'الإرسال', icon: Send },
]

export function GenerationPage() {
  useDocumentTitle('التوليد')
  const [query, setQuery] = useSearchParams()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(new Date())
  const requested = query.get('date')
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today
  const selectDate = (next: string) => setQuery({ date: next })

  return <div className="gen-page">
    <GenerationDay key={date} date={date} today={today} onDate={selectDate} />
  </div>
}

function GenerationDay({ date, today, onDate }: { date: string; today: string; onDate(date: string): void }) {
  const path = `/generation/${date}`
  const load = useLoad<GenerationData>(path)
  return <div className="entry">
    <header className="entry-head">
      <div><h1>التوليد</h1>{load.data && <p className="muted">{load.data.branch_name} · {dayName(date)}</p>}</div>
      <input className="input num" type="date" aria-label="تاريخ التقرير" max={today} value={date}
        onChange={(event) => { if (event.target.value) onDate(event.target.value) }} />
    </header>
    <ErrorBanner text={load.error} />
    {load.loading && !load.data && <Loading />}
    {load.data && <ReportEditor path={path} date={date} data={load.data} />}
    {!!load.data?.history.length && <Field label="التقارير السابقة">{(id) =>
      <select id={id} className="input select" value={date} onChange={(event) => onDate(event.target.value)}>
        {!load.data!.history.some((item) => item.report_date === date) && <option value={date}>{dayName(date)}</option>}
        {load.data!.history.map((item) => <option key={item.report_date} value={item.report_date}>{dayName(item.report_date)} · {statusInfo[item.status].label}</option>)}
      </select>
    }</Field>}
  </div>
}

function ReportEditor({ path, date, data }: { path: string; date: string; data: GenerationData }) {
  const user = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const [options, setOptions] = useState(data)
  const { fuel_types: fuelTypes, generators, previous } = options
  const [report, setReport] = useState<SiteReport>(() => data.report
    ?? applyAutoFigures(newReport(date, fuelTypes, generators, String(user.id), previous, new Date().toISOString()), previous))
  const [version, setVersion] = useState(data.report?.version ?? 0)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fuelName, setFuelName] = useState('')
  const [reason, setReason] = useState('')
  const editable = data.can.fill && isEditableStatus(report.status)
  const generatorName = (id: number) => generators.find((item) => item.id === id)?.name ?? 'مولد'
  const missing = missingItems(report, (id) => fuelTypes.find((item) => item.id === id)?.name ?? 'وقود', generatorName)

  const update: Update = (change) => setReport((current) => {
    const draft = structuredClone(current)
    change(draft)
    return applyAutoFigures(draft, previous)
  })

  function setSaved(saved: SavedReport) {
    setReport(saved)
    setVersion(saved.version)
  }

  async function refreshEquipment() {
    const fresh = await api<GenerationData>(path)
    setOptions(fresh)
    setReport((current) => applyAutoFigures(reconcileReport(current, fresh.fuel_types, fresh.generators), fresh.previous))
  }

  function reportError(e: unknown) {
    setError(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر تنفيذ العملية.')
  }

  async function addFuel(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/generation/equipment/fuel', { method: 'POST', body: { name: fuelName.trim(), isActive: true } })
      await refreshEquipment()
      setFuelName('')
    } catch (e) { reportError(e) } finally { setBusy(false) }
  }

  async function save(submit: boolean) {
    if (submit && !await confirm({ title: 'إغلاق وإرسال التقرير؟', message: missing.length ? `توجد ${missing.length} خانات ناقصة في التقرير.` : undefined, confirmLabel: 'إرسال التقرير' })) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ report: SavedReport }>(path, {
        method: 'PUT',
        body: {
          version,
          fuel: report.fuel.map(({ totalQty, consumption, ...line }) => line),
          generators: report.generators.map(({ runHours, storedLoads, ...log }) => ({ ...log, ...(storedLoads ?? {}) })),
          maintenance: report.maintenance,
          generalNotes: report.generalNotes,
        },
      })
      setSaved(result.report)
      if (submit) {
        const closed = await api<{ report: SavedReport }>(`${path}/submit`, { method: 'POST', body: { version: result.report.version } })
        setSaved(closed.report)
      }
      toast(submit ? 'أُغلق وأُرسل التقرير' : 'حُفظت المسودة')
    } catch (e) { reportError(e) } finally { setBusy(false) }
  }

  async function review(action: 'approve' | 'return') {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ report: SavedReport }>(`${path}/${action}`, { method: 'POST', body: { version, reason: reason.trim() || null } })
      setSaved(result.report)
      setReason('')
    } catch (e) { reportError(e) } finally { setBusy(false) }
  }

  return <>
    <div><Pill tone={statusInfo[report.status].tone}>{statusInfo[report.status].label}</Pill></div>
    <ErrorBanner text={error} />
    {report.returnedReason && <p className="card af-pad">سبب إعادة الفتح · {report.returnedReason}</p>}
    {editable ? <>
      <Stepper items={steps.map((item, index) => ({ ...item, done: index < step }))} current={step} onSelect={setStep} label="خطوات تعبئة التقرير" />
      <div className="entry-body" key={step}>
        {step === 0 && <>
          <FuelStep report={report} fuelTypes={fuelTypes} previous={previous} update={update} />
          <form className="card fcard" onSubmit={addFuel}>
            <Field label="نوع وقود جديد">{(id) => <input id={id} className="input" value={fuelName} maxLength={80} onChange={(event) => setFuelName(event.target.value)} />}</Field>
            <Button type="submit" busy={busy} disabled={!fuelName.trim()}>إضافة نوع وقود</Button>
          </form>
        </>}
        {step === 1 && <RunsStep report={report} generators={generators} update={update} onEquipmentSaved={() => void refreshEquipment().catch(reportError)} />}
        {step === 2 && <MaintenanceStep report={report} generators={generators} update={update} />}
        {step === 3 && <>
          <NotesField report={report} update={update} />
          {missing.length > 0 && <ul className="card af-pad">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
        </>}
      </div>
      <div className="entry-foot">
        {step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>السابق</Button>}
        <Button disabled={busy} onClick={() => void save(false)}>حفظ المسودة</Button>
        {step < steps.length - 1
          ? <Button variant="primary" onClick={() => setStep(step + 1)}>التالي</Button>
          : <Button variant="primary" disabled={busy} onClick={() => void save(true)}>إغلاق وإرسال</Button>}
      </div>
    </> : version ? <>
      <FuelTable report={report} fuelTypes={fuelTypes} />
      <section className="card fcard">
        <h2>تشغيل المولدات</h2>
        {report.generators.map((item) => <div key={item.id}>
          <b>{generatorName(item.generatorId)}</b>
          <p>{item.didRun ? `${formatAmount(item.runHours)} ساعة` : 'لم يعمل'}</p>
          {item.runs.filter((run) => run.start || run.end).map((run) => <p key={run.id}>{clock12(run.start)} – {clock12(run.end)}</p>)}
          {item.temperatureC !== null && <p>الحرارة {item.temperatureC} °C</p>}
          {item.oilPressure !== null && <p>ضغط الزيت {item.oilPressure} {item.oilPressureUnit}</p>}
          {item.bandLoads.some((value) => value !== null) && <p>الأحمال · {item.bandLoads.map((value) => formatAmount(value)).join(' / ')} {item.loadUnit}</p>}
          {item.notes && <p>{item.notes}</p>}
        </div>)}
      </section>
      <section className="card fcard">
        <h2>الصيانات والملاحظات</h2>
        {report.maintenance.map((item) => <div key={item.id}>
          <b>{item.generatorId ? generatorName(item.generatorId) : 'صيانة عامة'}</b>
          <p>{item.types.map(maintenanceLabel).join('، ')}</p>
          <p>زيت جديد {formatAmount(item.oilNewLiters)} لتر · زيت مستخدم {formatAmount(item.oilUsedLiters)} لتر</p>
          {item.description && <p>{item.description}</p>}
        </div>)}
        {report.generalNotes && <p>{report.generalNotes}</p>}
      </section>
      {data.can.approve && (report.status === 'submitted' || report.status === 'approved') && <div className="card fcard">
        {report.status === 'submitted' && <Button variant="primary" disabled={busy} onClick={() => void review('approve')}>اعتماد التقرير</Button>}
        <Field label="سبب إعادة فتح التقرير">{(id) => <input id={id} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
        <Button disabled={busy || !reason.trim()} onClick={() => void review('return')}>إعادة فتح التقرير</Button>
      </div>}
    </> : <p className="card af-pad">لا يوجد تقرير لهذا اليوم.</p>}
  </>
}
