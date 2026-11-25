import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { todayISO } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { parseIssueWorkbook, parseUsageWorkbook, planImport, rollPayload, type ImportPlan } from './import'
import { sealErrorText, useSealActions } from './repo'

export function ImportDialog({ onClose }: { onClose(): void }) {
  const toast = useToast()
  const { importFiles } = useSealActions()
  const [issueFile, setIssueFile] = useState<File | null>(null)
  const [usageFile, setUsageFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [fallbackDate, setFallbackDate] = useState('')
  const needsDate = plan?.rolls.some((roll) => !roll.receivedOn) ?? false
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyse() {
    if (!issueFile) return
    if (issueFile.size + (usageFile?.size ?? 0) > 10 * 1024 * 1024) {
      setError('حجم الملفات يتجاوز 10 ميغابايت.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const issue = await parseIssueWorkbook(ExcelJS, await issueFile.arrayBuffer())
      const usage = usageFile ? await parseUsageWorkbook(ExcelJS, await usageFile.arrayBuffer()) : { rows: [], repeated: 0, order: {} as Record<string, number[]>, fills: {} as Record<string, string[]> }
      if (!issue.rolls.length) throw new Error('empty')
      setPlan(planImport(issue.rolls, usage.rows, issue.suspicious, usage.order, usage.fills))
    } catch {
      setError('تعذّرت قراءة الملف. تأكد أنه ملف Excel (xlsx) سليم.')
    }
    setBusy(false)
  }

  async function run() {
    if (!plan || (needsDate && !fallbackDate)) return
    setBusy(true)
    setError(null)
    try {
      const result = await importFiles({
        rolls: plan.rolls.map((roll) => rollPayload({ ...roll, receivedOn: roll.receivedOn || fallbackDate }, (name) => name)),
        usage: plan.usage.map((item) => ({ no: item.no, status: item.status, used_on: item.usedOn || null, details: item.details, sheet: item.sheet })),
      })
      setLog([
        `استُورد ${result.rolls} رول و${result.batches} دفعات.`,
        `سُجّل استخدام ${result.used} ختم. الرولات الموجودة سابقًا: ${result.skipped}.`,
        `الأسطر التي لم تُطبّق: ${result.ignored}.`,
      ])
      setDone(true)
      toast('تم استيراد الملفات')
    } catch (e) {
      setError(sealErrorText(e))
    }
    setBusy(false)
  }

  return (
    <Dialog
      className="seal-dialog"
      open
      onClose={onClose}
      title="استيراد ملفات Excel القديمة"
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>تم</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
            {plan ? (
              <Button variant="primary" icon={<Upload size={17} />} busy={busy} disabled={needsDate && !fallbackDate} onClick={() => void run()}>استيراد الآن</Button>
            ) : (
              <Button variant="primary" busy={busy} disabled={!issueFile} onClick={() => void analyse()}>قراءة الملفات</Button>
            )}
          </>
        )
      }
    >
      <div className="import-box">
        {!plan && (
          <>
            <label className="import-file">
              <b><FileSpreadsheet size={16} className="inline-ico" /> ملف الصرف («اختام جديد»)</b>
              <input type="file" accept=".xlsx" onChange={(e) => setIssueFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="import-file">
              <b><FileSpreadsheet size={16} className="inline-ico" /> ملف الاستخدام («اختام متفرقة»)، اختياري</b>
              <input type="file" accept=".xlsx" onChange={(e) => setUsageFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="field-hint">يُقرأ الملفان على جهازك ثم يدخلان النظام. الاستيراد آمن لو أعدته: الرول الموجود يُتخطّى.</p>
          </>
        )}
        {plan && !done && (
          <>
            <div className="import-sum">
              <div><b className="num">{plan.totals.rolls}</b><span>رول</span></div>
              <div><b className="num">{plan.totals.batches}</b><span>دفعة</span></div>
              <div><b className="num">{plan.totals.seals}</b><span>ختم مصروف</span></div>
              <div><b className="num">{plan.totals.usage}</b><span>سطر استخدام</span></div>
            </div>
            {needsDate && <label className="field"><span>تاريخ استلام الرولات التي لم يُكتب لها تاريخ</span>
              <input className="input" type="date" max={todayISO()} value={fallbackDate} onChange={(event) => setFallbackDate(event.target.value)} />
            </label>}
            <p className="field-hint">الفنيون: {plan.technicians.join('، ')}. تُحفظ الأسماء غير الموجودة في سجل الأختام السابق.</p>
            {plan.stray.length > 0 && <p className="field-hint">{plan.stray.length} سطر استخدام رقمه ليس من أي رول، سيُتجاهل.</p>}
            {plan.fixed.length > 0 && <p className="field-hint">صُحّح تلقائياً (رقم ناقص خانة): {plan.fixed.map((f) => `${f.typed} ← ${f.now}`).join('، ')}</p>}
            {plan.unresolved.length > 0 && <p className="field-hint">تحتاج مراجعة بعد الاستيراد: {plan.unresolved.map((s) => `${s.no} (${s.tech})`).join('، ')}</p>}
          </>
        )}
        {log.length > 0 && <div className="import-log">{log.map((l, i) => <span key={i}>{l}</span>)}</div>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}
