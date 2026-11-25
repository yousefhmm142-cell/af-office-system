import { Check, Plus, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { dayName, describeDay, todayISO } from '../../lib/dates'
import { formatAmount } from '../../lib/numbers'
import { useReportDate } from '../sheets/ReportDate'
import { BackButton, DayJump } from '../sheets/ReportControls'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { MissingList } from '../generation/EntrySteps'
import { GeneratorLoadsPanel, type GeneratorLoad } from './GeneratorLoadsPanel'
import { readBandValues, type LoadUnit } from '../sheets/loads'
import { isEditableStatus, statusInfo, type SheetStatus } from '../sheets/workflow'
import { applyAutoHours, missingInZone, newSheet, reconcileSheet, sheetTotals, type DistributionSheet, type Zone } from './model'
import { ZoneStep } from './ZoneStep'
import '../../styles/generation.css'
import '../../styles/distribution.css'
import '../../styles/attendance-paper.css'

type SavedSheet = DistributionSheet & { version: number }
export interface DistributionData {
  branch_name: string
  sheet: SavedSheet | null
  previous: SavedSheet | null
  zones: Zone[]
  generatorLoads: GeneratorLoad[]
  history: { sheet_date: string; status: SheetStatus; hours: number; runs: number }[]
  can: { fill: boolean; approve: boolean }
}

export function DistributionEntryPage() {
  useDocumentTitle('تعبئة كشف التوزيع')
  const date = useReportDate()
  return <div className="gen-page distribution-page"><DistributionDay key={date} date={date} /></div>
}

function DistributionDay({ date }: { date: string }) {
  const path = `/distribution/${date}`
  const { data, error, loading } = useLoad<DistributionData>(path)
  const { weekday, date: longDate } = describeDay(date)
  return <div className="entry wide">
    <BackButton fallback={path} />
    <header className="entry-head"><div><h1>{date === todayISO() ? "كشف اليوم" : `كشف ${dayName(date)}`}</h1><p className="muted">{weekday} · {longDate}</p></div></header>
    <DayJump date={date} hrefFor={(day) => `/sheet/${day}`} />
    <ErrorBanner text={error} />
    {loading && !data && <Loading />}
    {data && (data.can.fill && (!data.sheet || isEditableStatus(data.sheet.status) || data.can.approve)
      ? <SheetEditor path={path} date={date} data={data} />
      : <Link className="btn" to={path}>عرض الكشف</Link>)}
  </div>
}

function SheetEditor({ path, date, data }: { path: string; date: string; data: DistributionData }) {
  const user = useUser()
  const navigate = useNavigate()
  const editingClosed = !!data.sheet && !isEditableStatus(data.sheet.status)
  const confirm = useConfirm()
  const toast = useToast()
  const [generatorLoads, setGeneratorLoads] = useState(data.generatorLoads)
  const [editedGenerators, setEditedGenerators] = useState<number[]>([])
  const [zones, setZones] = useState(data.zones)
  const [sheet, setSheet] = useState<DistributionSheet>(() => data.sheet
    ? (isEditableStatus(data.sheet.status) ? reconcileSheet(data.sheet, zones) : data.sheet)
    : newSheet(date, zones, String(user.id), data.previous, new Date().toISOString()))
  const [version, setVersion] = useState(data.sheet?.version ?? 0)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const names = new Map(zones.map((zone) => [zone.id, zone.name]))
  const missing = sheet.zones.flatMap((zone, index) => missingInZone(zone).map((text) => ({ text: `${names.get(zone.zoneId)}: ${text}`, step: index })))
  const sendIndex = sheet.zones.length
  const active = sheet.zones[step]
  const totals = sheetTotals(sheet)

  function updateGenerator(id: number, changes: Record<number, number | null>, unit?: LoadUnit) {
    setEditedGenerators((current) => current.includes(id) ? current : [...current, id])
    setGeneratorLoads((current) => current.map((row) => {
      if (row.generator_id !== id) return row
      const next = readBandValues(row.band_loads)
      for (const [band, value] of Object.entries(changes)) next[Number(band)] = value
      return { ...row, band_loads: next, load_unit: unit ?? row.load_unit }
    }))
  }

  function update(change: (draft: DistributionSheet) => void) {
    setSheet((current) => {
      const draft = structuredClone(current)
      change(draft)
      return applyAutoHours(draft)
    })
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await operation() } catch (e) {
      setError(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر تنفيذ العملية.')
    } finally { setBusy(false) }
  }

  function saved(response: { sheet: SavedSheet }) {
    setSheet(response.sheet)
    setVersion(response.sheet.version)
  }

  function addZone(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await api('/distribution/zones', { method: 'POST', body: { name: zoneName.trim() } })
      const fresh = await api<DistributionData>(path)
      setZones(fresh.zones)
      setSheet((current) => reconcileSheet(current, fresh.zones))
      setZoneName('')
    })
  }

  async function save(submit: boolean) {
    if (submit && !await confirm({ title: 'إغلاق اليوم وإرسال الكشف؟', message: missing.length ? `في الكشف ${missing.length} حقول فارغة.` : undefined, confirmLabel: 'إغلاق وإرسال' })) return
    await run(async () => {
      const draft = await api<{ sheet: SavedSheet }>(path, { method: 'PUT', body: {
        version, edit_closed: editingClosed, zones: sheet.zones.map(({ supplyHours, ...zone }) => zone), notes: sheet.notes,
        generatorLoadEdits: generatorLoads.filter((row) => editedGenerators.includes(row.generator_id))
          .map(({ generator_id, load_unit, band_loads }) => ({ generator_id, load_unit, band_loads })),
      } })
      saved(draft)
      setEditedGenerators([])
      if (submit) {
        saved(await api(`${path}/submit`, { method: 'POST', body: { version: draft.sheet.version } }))
        navigate(path, { replace: true })
      }
      if (editingClosed) navigate(path, { replace: true })
      toast(editingClosed ? "حُفظت التعديلات" : submit ? 'أُغلق وأُرسل الكشف' : 'حُفظت المسودة')
    })
  }

  return <>
    {editingClosed && <div className="banner" role="status"><p>تعدّل الكشف المرسل. تُحفظ التعديلات وتبقى حالة الاعتماد.</p></div>}
    <div className="no-print"><Pill tone={statusInfo[sheet.status].tone}>{statusInfo[sheet.status].label}</Pill></div>
    <ErrorBanner text={error} />
    {sheet.returnedReason && <p className="banner">سبب إعادة الفتح · {sheet.returnedReason}</p>}
    <div className="zone-layout">
      <nav className="zone-nav" aria-label="المناطق">
        {sheet.zones.map((zone, index) => {
          const done = missingInZone(zone).length === 0
          return <button key={zone.id} type="button" className="zone-item" aria-current={step === index ? 'step' : undefined}
            data-done={done || undefined} onClick={() => setStep(index)}>
            <span className="zone-dot">{done && step !== index ? <Check size={14} /> : <span className="num">{index + 1}</span>}</span>
            <span className="zone-text"><b>{names.get(zone.zoneId)}</b><small className="num">{!zone.supplied ? 'بدون تغذية'
              : zone.supplyHours === null ? 'لم تُعبّأ' : `${formatAmount(zone.supplyHours)} ساعة · ${zone.runs.length} تشغيلات`}</small></span>
          </button>
        })}
        <button type="button" className="zone-item send" aria-current={step === sendIndex ? 'step' : undefined} onClick={() => setStep(sendIndex)}>
          <span className="zone-dot"><Send size={14} /></span>
          <span className="zone-text"><b>الإرسال</b><small>{missing.length ? `${missing.length} خانات فارغة` : 'جاهز'}</small></span>
        </button>
      </nav>
      <div className="zone-main">
      <div className="entry-body" key={step}>
        {active ? <>
          <ZoneStep entry={active} index={step} count={sheet.zones.length} name={names.get(active.zoneId) ?? 'منطقة'} update={update} />
          <GeneratorLoadsPanel readings={generatorLoads} onChange={busy ? undefined : updateGenerator} />
        </> : <>
          <section className="fcard">
            <h3 className="fcard-title">الملاحظات</h3>
            <textarea className="textarea" rows={3} placeholder="أي شيء يجب أن يعرفه المدير…" aria-label="الملاحظات العامة"
              maxLength={4000} value={sheet.notes} onChange={(event) => update((draft) => { draft.notes = event.target.value })} />
          </section>
          <section className="card summary">
            {sheet.zones.map((zone, index) => <button key={zone.id} type="button" className="summary-row as-button" onClick={() => setStep(index)}>
              <span>{names.get(zone.zoneId)}</span>
              <b className="num">{zone.supplied ? `${formatAmount(zone.supplyHours)} ساعة · ${zone.runs.length} تشغيلات` : 'بدون تغذية'}</b>
            </button>)}
            <div className="summary-row total"><span>المجموع</span><b className="num">{formatAmount(totals.totalHours)} ساعة · {totals.runs} تشغيلات</b></div>
          </section>
          <MissingList items={missing} onJump={setStep} />
        </>}
      </div>
      <form className="fcard" onSubmit={addZone}>
        <Field label="اسم منطقة التوزيع">{(id) => <input id={id} className="input" maxLength={80} value={zoneName} onChange={(event) => setZoneName(event.target.value)} />}</Field>
        <Button type="submit" icon={<Plus size={16} />} disabled={busy || !zoneName.trim()}>إضافة منطقة</Button>
      </form>
      </div>
    </div>
    <footer className="entry-foot glass">
      {step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>السابق</Button>}
      <Button disabled={busy || !sheet.zones.length} onClick={() => void save(false)}>{editingClosed ? "حفظ التعديلات والعودة" : "حفظ المسودة"}</Button>
      {step < sendIndex ? <Button variant="primary" size="lg" block onClick={() => setStep(step + 1)}>
        التالي: {names.get(sheet.zones[step + 1]?.zoneId ?? 0) ?? 'الإرسال'}</Button>
        : editingClosed ? null : <Button variant="primary" size="lg" block disabled={busy || !sheet.zones.length} onClick={() => void save(true)}>إغلاق اليوم وإرسال</Button>}
    </footer>
  </>
}
