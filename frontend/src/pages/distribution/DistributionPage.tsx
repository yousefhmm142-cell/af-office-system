import { LayoutGrid, Plus, Send } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useUser } from '../../app/auth'
import { dayName, isISODate, todayISO } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { ReportDownloads } from '../../ui/ReportDownloads'
import { useToast } from '../../ui/Toast'
import { MissingList } from '../generation/EntrySteps'
import { defaultAlertSettings } from '../generation/model'
import { GeneratorLoadsPanel, type GeneratorLoad } from './GeneratorLoadsPanel'
import { readBandValues, type LoadUnit } from '../sheets/loads'
import { Stepper } from '../sheets/Stepper'
import { isEditableStatus, statusInfo, type SheetStatus } from '../sheets/workflow'
import { applyAutoHours, missingInZone, newSheet, reconcileSheet, type DistributionSheet, type Zone } from './model'
import { PrintSheet } from './PrintSheet'
import { SheetView } from './SheetView'
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

export function DistributionPage() {
  useDocumentTitle('التوزيع')
  const [query, setQuery] = useSearchParams()
  const params = useParams()
  const requested = query.get('date') ?? params.date
  const today = todayISO()
  const date = isISODate(requested) && requested! <= today ? requested! : today
  return <div className="gen-page distribution-page">
    <DistributionDay key={date} date={date} today={today} onDate={(value) => setQuery({ date: value })} />
  </div>
}

function DistributionDay({ date, today, onDate }: { date: string; today: string; onDate(date: string): void }) {
  const path = `/distribution/${date}`
  const { data, error, loading } = useLoad<DistributionData>(path)
  return <div className="entry wide">
    <header className="entry-head no-print">
      <div><h1>التوزيع والأحمال</h1><p className="muted">{data?.branch_name} · {dayName(date)}</p></div>
      <div className="af-report-downloads">
        <input className="input" type="date" aria-label="تاريخ الكشف" max={today} value={date} onChange={(event) => { if (event.target.value) onDate(event.target.value) }} />
        <Link to="/distribution/history" className="btn">الكشوف السابقة</Link>

      </div>
    </header>
    <ErrorBanner text={error} />
    {loading && !data && <Loading />}
    {data && <SheetEditor path={path} date={date} data={data} />}
  </div>
}

function SheetEditor({ path, date, data }: { path: string; date: string; data: DistributionData }) {
  const user = useUser()
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
  const [reason, setReason] = useState('')
  const printer = useRef<HTMLDivElement>(null)
  const names = new Map(zones.map((zone) => [zone.id, zone.name]))
  const editable = data.can.fill && isEditableStatus(sheet.status)
  const missing = sheet.zones.flatMap((zone, index) => missingInZone(zone).map((text) => ({ text: `${names.get(zone.zoneId)}: ${text}`, step: index })))
  const steps = [...sheet.zones.map((zone) => ({ key: String(zone.zoneId), label: names.get(zone.zoneId) ?? 'منطقة', icon: LayoutGrid })), { key: 'send', label: 'الإرسال', icon: Send }]
  const active = sheet.zones[step]

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
        version, zones: sheet.zones.map(({ supplyHours, ...zone }) => zone), notes: sheet.notes,
        generatorLoadEdits: generatorLoads.filter((row) => editedGenerators.includes(row.generator_id))
          .map(({ generator_id, load_unit, band_loads }) => ({ generator_id, load_unit, band_loads })),
      } })
      saved(draft)
      setEditedGenerators([])
      if (submit) saved(await api(`${path}/submit`, { method: 'POST', body: { version: draft.sheet.version } }))
      toast(submit ? 'أُغلق وأُرسل الكشف' : 'حُفظت المسودة')
    })
  }

  return <>
    <div className="no-print"><Pill tone={statusInfo[sheet.status].tone}>{statusInfo[sheet.status].label}</Pill></div>
    <ErrorBanner text={error} />
    {sheet.returnedReason && <p className="banner">سبب إعادة الفتح · {sheet.returnedReason}</p>}
    {editable ? <>
      <Stepper items={steps.map((item, index) => ({ ...item, done: index < step && !missing.some((field) => field.step === index) }))} current={step} onSelect={setStep} label="مناطق التوزيع" scroll />
      <div className="entry-body" key={step}>
        {active ? <>
          <ZoneStep entry={active} index={step} count={sheet.zones.length} name={names.get(active.zoneId) ?? 'منطقة'} update={update} />
          <GeneratorLoadsPanel readings={generatorLoads} onChange={busy ? undefined : updateGenerator} />
        </> : <>
          <Field label="ملاحظات الكشف">{(id) => <textarea id={id} className="input textarea" maxLength={4000} value={sheet.notes} onChange={(event) => update((draft) => { draft.notes = event.target.value })} />}</Field>
          {!!missing.length && <MissingList items={missing} onJump={setStep} />}
        </>}
      </div>
      <form className="fcard" onSubmit={addZone}>
        <Field label="اسم منطقة التوزيع">{(id) => <input id={id} className="input" maxLength={80} value={zoneName} onChange={(event) => setZoneName(event.target.value)} />}</Field>
        <Button type="submit" icon={<Plus size={16} />} disabled={busy || !zoneName.trim()}>إضافة منطقة</Button>
      </form>
      <div className="entry-foot">
        {step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>السابق</Button>}
        <Button disabled={busy || !sheet.zones.length} onClick={() => void save(false)}>حفظ المسودة</Button>
        {step < steps.length - 1 ? <Button variant="primary" onClick={() => setStep(step + 1)}>التالي</Button>
          : <Button variant="primary" disabled={busy || !sheet.zones.length} onClick={() => void save(true)}>إغلاق وإرسال</Button>}
      </div>
    </> : version ? <>
      <div className="no-print"><SheetView sheet={sheet} ctx={{ zoneNames: names, names: new Map([[String(user.id), user.name]]), settings: defaultAlertSettings }} /></div>
      <div ref={printer} className="landscape"><PrintSheet sheet={sheet} zoneNames={names} /></div>
      <ReportDownloads sheet={printer} name={`كشف التوزيع ${date}`} headers={['المنطقة', 'ساعات التغذية', 'التشغيلات']}
        rows={sheet.zones.map((zone) => [names.get(zone.zoneId) ?? 'منطقة', zone.supplyHours ?? '—', zone.runs.map((run) => [run.start, run.end].filter(Boolean).join(' – ')).filter(Boolean).join(' / ')])} />
      {data.can.approve && (sheet.status === 'submitted' || sheet.status === 'approved') && <div className="fcard no-print">
        {sheet.status === 'submitted' && <Button variant="primary" disabled={busy} onClick={() => void run(async () => saved(await api(`${path}/approve`, { method: 'POST', body: { version } })))}>اعتماد الكشف</Button>}
        <Field label="سبب إعادة الفتح">{(id) => <input id={id} className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
        <Button disabled={busy || !reason.trim()} onClick={() => void run(async () => saved(await api(`${path}/return`, { method: 'POST', body: { version, reason } })))}>إعادة فتح الكشف</Button>
      </div>}
    </> : <p className="card af-pad">لا يوجد كشف لهذا اليوم.</p>}
  </>
}
