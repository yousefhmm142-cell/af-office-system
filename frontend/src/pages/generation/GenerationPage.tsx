import { ArrowLeft, Droplet, Gauge, Send, Wrench, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { dayName, describeDay, todayISO } from '../../lib/dates'
import { useReportDate } from '../sheets/ReportDate'
import { BackButton, DayJump } from '../sheets/ReportControls'
import { Stepper } from '../sheets/Stepper'
import { FuelStep, MaintenanceStep, MissingList, NotesField, RunsStep, type Update } from './EntrySteps'
import { applyAutoFigures, isEditableStatus, missingItems, newReport, reconcileReport, reportTotals, statusInfo, type FuelType, type Generator, type SheetStatus, type SiteReport } from './model'
import { hasBandValues } from '../sheets/loads'
import { advanceOnEnter } from '../../ui/form'
import { formatAmount } from '../../lib/numbers'
import '../../styles/generation.css'

type SavedReport = SiteReport & { version: number }
export interface GenerationData {
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

export function GenerationEntryPage() {
  useDocumentTitle('تعبئة تقرير التوليد')
  const date = useReportDate()
  return <div className="gen-page"><GenerationDay key={date} date={date} /></div>
}

function GenerationDay({ date }: { date: string }) {
  const path = `/generation/${date}`
  const load = useLoad<GenerationData>(path)
  const { weekday, date: longDate } = describeDay(date)
  return <div className="entry">
    <BackButton fallback={path} />
    <header className="entry-head"><div><h1>{date === todayISO() ? "تقرير اليوم" : `تقرير ${dayName(date)}`}</h1><p className="muted">{weekday} · {longDate}{load.data?.branch_name && ` · ${load.data.branch_name}`}</p></div></header>
    <DayJump date={date} hrefFor={(day) => `/entry/${day}`} />
    <ErrorBanner text={load.error} />
    {load.loading && !load.data && <Loading />}
    {load.data && (load.data.can.fill && (!load.data.report || isEditableStatus(load.data.report.status) || load.data.can.approve)
      ? <ReportEditor path={path} date={date} data={load.data} />
      : <Link className="btn" to={path}>عرض التقرير</Link>)}
  </div>
}

function ReportEditor({ path, date, data }: { path: string; date: string; data: GenerationData }) {
  const user = useUser()
  const navigate = useNavigate()
  const editingClosed = !!data.report && !isEditableStatus(data.report.status)
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
  const generatorName = (id: number) => generators.find((item) => item.id === id)?.name ?? 'مولد'
  const fuelLabel = (id: number) => fuelTypes.find((item) => item.id === id)?.name ?? 'وقود'
  const missing = [
    { fuel: report.fuel }, { generators: report.generators }, { maintenance: report.maintenance },
  ].flatMap((part, index) => missingItems({ ...report, fuel: [], generators: [], maintenance: [], ...part }, fuelLabel, generatorName)
    .map((text) => ({ text, step: index })))
  const totals = reportTotals(report)

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
          version, edit_closed: editingClosed,
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
        navigate(path, { replace: true })
      }
      if (editingClosed) navigate(path, { replace: true })
      toast(editingClosed ? "حُفظت التعديلات" : submit ? 'أُغلق وأُرسل التقرير' : 'حُفظت المسودة')
    } catch (e) { reportError(e) } finally { setBusy(false) }
  }

  return <>
    {editingClosed && <div className="banner" role="status"><p>تعدّل التقرير المرسل. تُحفظ التعديلات وتبقى حالة الاعتماد.</p></div>}
    <div><Pill tone={statusInfo[report.status].tone}>{statusInfo[report.status].label}</Pill></div>
    <ErrorBanner text={error} />
    {report.returnedReason && <p className="card af-pad">سبب إعادة الفتح · {report.returnedReason}</p>}
      <Stepper items={steps.map((item, index) => ({ ...item, done: index < 3 && !missing.some((item) => item.step === index) }))} current={step} onSelect={setStep} label="خطوات تعبئة التقرير" />
      <div className="entry-body" key={step} onKeyDown={advanceOnEnter}>
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
          <section className="card summary">
            <div className="summary-row"><Droplet size={17} /><span>المحروقات</span><b className="num">استهلاك {formatAmount(totals.consumption)} · متبقي {formatAmount(totals.remaining)} لتر</b></div>
            <div className="summary-row"><Zap size={17} /><span>التشغيل</span><b className="num">{totals.generatorsRan} مولدات · {formatAmount(totals.runHours)} ساعة</b></div>
            <div className="summary-row"><Gauge size={17} /><span>الأحمال من كشف التوزيع</span><b className="num">{report.generators.filter((item) => item.didRun && hasBandValues(item.bandLoads)).length} من {totals.generatorsRan} مولدات معبّأة</b></div>
            <div className="summary-row"><Wrench size={17} /><span>الصيانات</span><b className="num">{report.maintenance.length ? `${report.maintenance.length} عملية` : 'لا شيء'}</b></div>
          </section>
          <MissingList items={missing} onJump={setStep} />
        </>}
      </div>
      <footer className="entry-foot glass">
        {step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>السابق</Button>}
        <Button disabled={busy} onClick={() => void save(false)}>{editingClosed ? "حفظ التعديلات والعودة" : "حفظ المسودة"}</Button>
        {step < steps.length - 1
          ? <Button variant="primary" size="lg" block onClick={() => setStep(step + 1)}>التالي: {steps[step + 1]?.label}<ArrowLeft size={18} /></Button>
          : editingClosed ? null : <Button variant="send" size="lg" block busy={busy} icon={<Send size={18} />} onClick={() => void save(true)}>إغلاق اليوم وإرسال</Button>}
      </footer>
  </>
}
