import { CheckCheck, History, Pencil, QrCode, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { can, scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { dayName, hm, STATE, type Board as BoardData, type BoardRow } from './lib'

const todayGaza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())

/** One branch, one day: who came, who is late, who is missing. The branch manager approves and fixes. */
export function Board() {
  const me = useUser()
  const toast = useToast()
  const all = scopeOf(me, 'attendance.view') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [branchId, setBranchId] = useState<string>(me.branch ? String(me.branch.id) : '')
  const [date, setDate] = useState(todayGaza)
  const chosen = branchId || (all ? String(branches.data?.branches[0]?.id ?? '') : '')
  const { data, error, loading, reload } = useLoad<BoardData>(chosen ? `/attendance/board?branch_id=${chosen}&date=${date}` : null)
  const [editing, setEditing] = useState<BoardRow | null>(null)
  const [history, setHistory] = useState<BoardRow | null>(null)
  const [approving, setApproving] = useState(false)

  async function approveAll() {
    setApproving(true)
    try {
      const res = await api<{ approved: number }>('/attendance/approve', { method: 'POST', body: { branch_id: Number(chosen), date } })
      toast(`اعتُمد ${res.approved}`)
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُعتمد', 'danger') } finally { setApproving(false) }
  }

  return (
    <>
      <PageHead title="حضور الفرع" eyebrow={dayName(date)}
        actions={can(me, 'attendance.points') && chosen && <Link to={`/attendance/points?branch_id=${chosen}`} className="btn"><QrCode size={18} /> أوراق الـQR</Link>} />
      <div className="af-toolbar">
        {all && (
          <select className="input select" value={chosen} onChange={(e) => setBranchId(e.target.value)} aria-label="الفرع">
            {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <input className="input num af-date" type="date" value={date} max={todayGaza()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="اليوم" />
        {data?.can_manage && data.summary.pending > 0 && (
          <Button variant="primary" icon={<CheckCheck size={18} />} busy={approving} onClick={() => void approveAll()}>اعتماد الكل ({data.summary.pending})</Button>
        )}
      </div>
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="dash-kpis">
            <div className="dash-kpi glass"><span className="dash-kpi-l">المطلوب حضورهم</span><span className="dash-kpi-n num">{data.summary.expected}</span></div>
            <div className="dash-kpi glass" data-tone="ok"><span className="dash-kpi-l">الحاضرون</span><span className="dash-kpi-n num">{data.summary.present}</span></div>
            <div className="dash-kpi glass" data-tone="warn"><span className="dash-kpi-l">المتأخرون</span><span className="dash-kpi-n num">{data.summary.late}</span></div>
            <div className="dash-kpi glass" data-tone="danger"><span className="dash-kpi-l">الغائبون</span><span className="dash-kpi-n num">{data.summary.absent}</span></div>
          </div>
          <div className="card glass rows">
            {data.rows.map((r) => (
              <div key={r.user.id} className="row af-attrow">
                <span className="row-label">{r.user.name}<small className="af-sub">{r.user.job_title ?? ''}{r.schedule ? ` · ${r.schedule}` : ''}</small></span>
                <span className="af-att-times num" dir="ltr">{r.day?.check_in ?? '—'} → {r.day?.check_out ?? '—'}</span>
                <span className="af-badges">
                  <Pill tone={STATE[r.state].tone}>{STATE[r.state].label}</Pill>
                  {r.day && r.day.late_minutes > 0 && <Pill tone="warn" dot={false}>{r.day.late_minutes} دقيقة</Pill>}
                  {r.day && r.day.overtime_minutes > 0 && <Pill tone="ok" dot={false}>+{hm(r.day.overtime_minutes)}</Pill>}
                  {r.day?.recorded_offline && <Pill tone="info" dot={false}><WifiOff size={12} /></Pill>}
                  {r.day?.approval_status === 'approved' && <Pill tone="brand" dot={false}>معتمد</Pill>}
                </span>
                <span className="af-row-actions">
                  {r.day && <button type="button" className="icon-btn" aria-label={`سجل ${r.user.name}`} title="السجل" onClick={() => setHistory(r)}><History size={16} /></button>}
                  {data.can_manage && r.user.id !== me.id && <button type="button" className="icon-btn" aria-label={`تعديل ${r.user.name}`} title="تعديل" onClick={() => setEditing(r)}><Pencil size={16} /></button>}
                </span>
              </div>
            ))}
            {data.rows.length === 0 && <p className="eyebrow af-pad">لا يوجد في هذا الفرع موظفون يسجّلون الحضور.</p>}
          </div>
        </>
      )}
      {editing && <EditDay row={editing} date={date} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
      {history?.day && <DayHistory row={history} onClose={() => setHistory(null)} />}
    </>
  )
}

function EditDay({ row, date, onClose, onSaved }: { row: BoardRow; date: string; onClose(): void; onSaved(): void }) {
  const toast = useToast()
  const [inT, setIn] = useState(row.day?.check_in ?? '')
  const [outT, setOut] = useState(row.day?.check_out ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true); setFields({}); setError(null)
    try {
      await api('/attendance/days', { method: 'PUT', body: { user_id: row.user.id, date, check_in: inT || null, check_out: outT || null, reason: reason.trim() || null } })
      toast('تم الحفظ')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(Object.keys(err.fields).length ? null : err.message) }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={row.user.name} subtitle={`${dayName(date)} · يُحفظ في السجل من عدّل ومتى`} icon={<Pencil size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => void save()}>حفظ واعتماد</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <div className="af-row2">
          <Field label="الحضور" error={fields.check_in}>{(id) => <input id={id} className="input num" type="time" value={inT} onChange={(e) => setIn(e.target.value)} />}</Field>
          <Field label="الانصراف" error={fields.check_out}>{(id) => <input id={id} className="input num" type="time" value={outT} onChange={(e) => setOut(e.target.value)} />}</Field>
        </div>
        <Field label="ملاحظة (اختياري)" error={fields.reason}>{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: لا يملك جوالاً" />}</Field>
        <ErrorBanner text={error ?? fields.date ?? null} />
      </form>
    </Dialog>
  )
}

interface HistoryData {
  punches: Array<{ kind: string; at: string; method: string; offline: boolean; by: string | null; reason: string | null }>
  edits: Array<{ old: { check_in: string | null; check_out: string | null } | null; new: { check_in: string | null; check_out: string | null }; reason: string | null; by: string | null; at: string }>
}
const METHOD: Record<string, string> = { qr: 'QR', app: 'زر النظام', manual: 'يدوي' }

function DayHistory({ row, onClose }: { row: BoardRow; onClose(): void }) {
  const { data } = useLoad<HistoryData>(`/attendance/days/${row.day!.id}/history`)
  const t = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Gaza' }).format(new Date(iso))
  return (
    <Dialog open onClose={onClose} title={`سجل ${row.user.name}`} icon={<History size={20} />} footer={<Button onClick={onClose}>إغلاق</Button>}>
      {!data ? <Loading /> : (
        <div className="rows">
          {data.punches.map((p, i) => (
            <div key={`p${i}`} className="row">
              <span className="row-label">{p.kind === 'in' ? 'حضور' : 'انصراف'}<small className="af-sub">{METHOD[p.method] ?? p.method}{p.offline ? ' · حُفظ دون إنترنت' : ''}{p.by ? ` · ${p.by}` : ''}{p.reason ? ` · ${p.reason}` : ''}</small></span>
              <span className="row-value num">{t(p.at)}</span>
            </div>
          ))}
          {data.edits.map((e, i) => (
            <div key={`e${i}`} className="row">
              <span className="row-label">تعديل<small className="af-sub">{e.by ?? '—'}{e.reason ? ` · ${e.reason}` : ''}</small></span>
              <span className="row-value num" dir="ltr">{e.old ? `${e.old.check_in ?? '—'}→${e.old.check_out ?? '—'}` : 'جديد'} ⇒ {e.new.check_in ?? '—'}→{e.new.check_out ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
