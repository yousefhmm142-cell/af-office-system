import { CheckCheck, Clock3, History, Pencil, QrCode, UserCheck, UserX, Users, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { can, scopeOf, useUser } from '../../app/auth'
import { clock12 } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { Points } from './Points'
import { WeekSheet, weekStart } from './WeekSheet'
import '../../styles/attendance-reference.css'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
import { ScrollTable } from '../../ui/ScrollTable'
import { TimeField } from '../../ui/TimeField'
import { useToast } from '../../ui/Toast'
import { dayName, hm, STATE, type Board as BoardData, type BoardRow } from './lib'

const todayGaza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())

/** One branch, one day: who came, who is late, who is missing. The branch manager approves and fixes. */
export function Board() {
  const me = useUser()
  const toast = useToast()
  const manager = me.role?.key === 'branch_manager'
  const all = scopeOf(me, 'attendance.view') === 'all'
  const [params, setParams] = useSearchParams()
  const showPoints = can(me, 'attendance.points')
  const tab = params.get('tab')
  const view = tab === 'sheet' && manager && showPoints ? 'sheet'
    : tab === 'week' ? 'week'
    : all && tab !== 'today' && !params.has('branch_id') ? 'overview'
    : 'day'
  useDocumentTitle(all ? 'حضور الفروع' : 'الحضور والانصراف')

  function setView(next: 'overview' | 'day' | 'week' | 'sheet') {
    setParams((current) => {
      const query = new URLSearchParams(current)
      if (next === 'overview') {
        query.delete('branch_id')
        query.delete('tab')
      } else {
        query.set('tab', next === 'day' ? 'today' : next)
      }
      return query
    }, { replace: true })
  }
  const [week, setWeek] = useState(() => weekStart(todayGaza()))
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [branchId, setBranchId] = useState<string>(() => all ? (params.get('branch_id') ?? '') : String(me.branch?.id ?? ''))
  const [date, setDate] = useState(todayGaza)
  const [overviewDate, setOverviewDate] = useState(todayGaza)
  const chosen = branchId || (all ? String(branches.data?.branches[0]?.id ?? '') : '')
  const { data: loaded, error, loading, reload } = useLoad<BoardData>(chosen && view === 'day' ? `/attendance/board?branch_id=${chosen}&date=${date}` : null)
  const data = loaded?.date === date && String(loaded.branch_id) === chosen ? loaded : null
  const [editing, setEditing] = useState<BoardRow | null>(null)
  const [editingDate, setEditingDate] = useState(date)
  const [weekRevision, setWeekRevision] = useState(0)
  const [history, setHistory] = useState<{ row: BoardRow; canManage: boolean } | null>(null)
  const [approving, setApproving] = useState(false)

  function editDay(row: BoardRow, selected = date) {
    setHistory(null)
    setEditingDate(selected)
    setEditing(row)
  }

  async function approveAll() {
    setApproving(true)
    try {
      const res = await api<{ approved: number }>('/attendance/approve', { method: 'POST', body: { branch_id: Number(chosen), date } })
      toast(`اعتُمد ${res.approved}`)
      void reload()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُعتمد', 'danger') } finally { setApproving(false) }
  }

  const tabs = (
    <div className="segmented af-tabs af-attendance-views" role="radiogroup" aria-label="عرض الحضور">
      {all && <button type="button" role="radio" aria-checked={view === 'overview'} onClick={() => setView('overview')}>نظرة عامة</button>}
      <button type="button" role="radio" aria-checked={view === 'day'} onClick={() => setView('day')}>{all ? 'كشف الفرع' : 'اليوم'}</button>
      <button type="button" role="radio" aria-checked={view === 'week'} onClick={() => setView('week')}>الكشف الأسبوعي</button>
      {manager && showPoints && <button type="button" role="radio" aria-checked={view === 'sheet'} onClick={() => setView('sheet')}>ورقة الـQR</button>}
    </div>
  )

  return (
    <div className={manager ? 'af-branch-attendance' : undefined}>
      {manager ? (
        <header className="af-branch-attendance-head">
          <div><h1>الحضور والانصراف</h1><p>تسجيل الحضور من النظام أو بمسح رمز الـQR في المكتب.</p></div>
          {tabs}
        </header>
      ) : (
        <>
          <PageHead title={all ? 'حضور الفروع' : 'الحضور والانصراف'} eyebrow={view === 'day' ? dayName(date) : undefined}
            actions={view !== 'overview' && showPoints && chosen && <Link to={`/attendance/points?branch_id=${chosen}`} className="btn"><QrCode size={18} /> أوراق الـQR</Link>} />
          {tabs}
        </>
      )}
      {view === 'sheet' && chosen && <Points key={chosen} embeddedBranch={chosen} />}
      {view === 'overview' && <AttendanceOverview date={overviewDate} onDateChange={setOverviewDate} onSelect={(id, selectedDate) => { setBranchId(String(id)); setDate(selectedDate); setView('day') }} />}
      {((view === 'day' && (!manager || date !== todayGaza() || (data?.can_manage && data.summary.pending > 0))) || (view === 'week' && all)) && <div className="af-toolbar af-attendance-views">
        {all && (
          <select className="input select" value={chosen} onChange={(e) => setBranchId(e.target.value)} aria-label="الفرع">
            {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {view === 'day' && (!manager || date !== todayGaza()) && <input className="input num af-date" type="date" value={date} max={todayGaza()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="اليوم" />}
        {view === 'day' && data?.can_manage && data.summary.pending > 0 && (
          <Button variant="primary" icon={<CheckCheck size={18} />} busy={approving} onClick={() => void approveAll()}>اعتماد الكل ({data.summary.pending})</Button>
        )}
      </div>}
      {view === 'week' && chosen && <WeekSheet key={`${chosen}-${week}-${weekRevision}`} branch={chosen} branchName={all ? branches.data?.branches.find((branch) => String(branch.id) === chosen)?.name : me.branch?.name} start={week} today={todayGaza()} onWeek={setWeek} onDay={(day, row, canManage) => {
        if (row.day) setHistory({ row, canManage })
        else if (canManage && row.user.id !== me.id) editDay(row, day)
      }} />}
      {view === 'day' && <ErrorBanner text={error} />}
      {view === 'day' && (loading && !data ? <Loading /> : data && (
        <>
          {manager ? <BranchDay data={data} onOpen={(row) => {
            if (row.day) setHistory({ row, canManage: data.can_manage })
            else editDay(row)
          }} canEdit={(row) => data.can_manage && row.user.id !== me.id} /> : <>
          <div className="dash-kpis">
            <div className="dash-kpi glass"><span className="dash-kpi-l">المطلوب حضورهم</span><span className="dash-kpi-n num">{data.summary.expected}</span></div>
            <div className="dash-kpi glass" data-tone="ok"><span className="dash-kpi-l">الحاضرون</span><span className="dash-kpi-n num">{data.summary.present}</span></div>
            <div className="dash-kpi glass" data-tone="warn"><span className="dash-kpi-l">المتأخرون</span><span className="dash-kpi-n num">{data.summary.late}</span></div>
            <div className="dash-kpi glass" data-tone="danger"><span className="dash-kpi-l">الغائبون</span><span className="dash-kpi-n num">{data.summary.absent}</span></div>
          </div>
          <div className="card glass af-attendance-table">
            <ScrollTable label="حضور الموظفين">
            <table className="tbl">
              <thead><tr><th scope="col">الموظف</th><th scope="col">الحضور والانصراف</th><th scope="col">الحالة</th><th scope="col">الإجراءات</th></tr></thead>
              <tbody>
            {data.rows.map((r) => (
              <tr key={r.user.id}>
                <th scope="row"><span className="af-att-person"><Avatar name={r.user.name} size={32} /><span>{r.user.name}<small className="af-sub">{r.user.job_title ?? ''}{r.schedule ? ` · ${r.schedule}` : ''}</small></span></span></th>
                <td><span className="af-att-time num" dir="ltr"><b className="af-time-in">{r.day?.check_in ?? '—'}</b> · <b className="af-time-out">{r.day?.check_out ?? '—'}</b></span></td>
                <td><span className="af-badges">
                  <Pill tone={STATE[r.state].tone}>{STATE[r.state].label}</Pill>
                  {r.day && r.day.late_minutes > 0 && <Pill tone="warn" dot={false}>{r.day.late_minutes} دقيقة</Pill>}
                  {r.day && r.day.overtime_minutes > 0 && <Pill tone="ok" dot={false}>+{hm(r.day.overtime_minutes)}</Pill>}
                  {r.day?.recorded_offline && <Pill tone="info" dot={false}><WifiOff size={12} /></Pill>}
                  {r.day?.approval_status === 'approved' && <Pill tone="brand" dot={false}>معتمد</Pill>}
                </span></td>
                <td><span className="af-row-actions">
                  {r.day && <button type="button" className="icon-btn" aria-label={`سجل ${r.user.name}`} title="السجل" onClick={() => setHistory({ row: r, canManage: data.can_manage })}><History size={16} /></button>}
                  {data.can_manage && r.user.id !== me.id && <button type="button" className="icon-btn" aria-label={`تعديل ${r.user.name}`} title="تعديل" onClick={() => editDay(r)}><Pencil size={16} /></button>}
                </span></td>
              </tr>
            ))}
              </tbody>
            </table>
            </ScrollTable>
            {data.rows.length === 0 && <p className="eyebrow af-pad">لا يوجد في هذا الفرع موظفون يسجّلون الحضور.</p>}
          </div>
          </>}
        </>
      ))}
      {editing && <EditDay row={editing} date={editingDate} onClose={() => setEditing(null)} onSaved={() => {
        setEditing(null)
        if (view === 'week') setWeekRevision((previous) => previous + 1)
        else void reload()
      }} />}
      {history?.row.day && <DayHistory row={history.row} onClose={() => setHistory(null)}
        onEdit={history.row.user.id !== me.id && history.canManage
          ? () => editDay(history.row, history.row.day?.date) : undefined} />}
    </div>
  )
}

function BranchDay({ data, onOpen, canEdit }: {
  data: BoardData; onOpen(row: BoardRow): void; canEdit(row: BoardRow): boolean
}) {
  const left = data.rows.filter((row) => row.state === 'left').length
  const working = data.summary.present - left
  const missing = data.summary.expected - data.summary.present
  const priority = ['absent', 'not_yet', 'late', 'present', 'left', 'off']
  const ordered = [...data.rows].sort((a, b) => priority.indexOf(a.state) - priority.indexOf(b.state) || a.user.name.localeCompare(b.user.name, 'ar'))
  return (
    <div className="af-branch-day">
      <div className="kpis">
        <div className="kpi hero"><div className="kpi-label"><span className="kpi-ico"><UserCheck size={16} /></span>حضروا</div><div className="kpi-value num">{data.summary.present}<small> من {data.summary.expected}</small></div><div className="kpi-sub">{dayName(data.date)}</div></div>
        <div className="kpi glass"><div className="kpi-label"><span className="kpi-ico"><Clock3 size={16} /></span>في الدوام</div><div className="kpi-value num">{working}</div><div className="kpi-sub">سجّلوا الحضور ولم ينصرفوا</div></div>
        <div className="kpi glass" data-tone={missing ? 'danger' : undefined}><div className="kpi-label"><span className="kpi-ico"><UserX size={16} /></span>لم يحضروا</div><div className="kpi-value num">{missing}</div><div className="kpi-sub">منهم {data.summary.absent} غائبون</div></div>
        <div className="kpi glass"><div className="kpi-label"><span className="kpi-ico"><Users size={16} /></span>انصرفوا</div><div className="kpi-value num">{left}</div><div className="kpi-sub">سجّلوا الانصراف</div></div>
      </div>
      {data.rows.length === 0 && <p className="card af-pad">لا يوجد في هذا الفرع موظفون يسجّلون الحضور.</p>}
      <ul className="att-list">
        {ordered.map((row) => (
          <li key={row.user.id}>
            <button type="button" className="att-row card" disabled={!row.day && !canEdit(row)} onClick={() => onOpen(row)}>
              <Avatar name={row.user.name} size={38} />
              <span className="att-name"><b>{row.user.name}</b><small>{[row.user.job_title, row.schedule].filter(Boolean).join(' · ')}</small></span>
              {row.day?.check_in && <span className="att-times"><span className="af-att-time num" dir="ltr">
                <b className="af-time-in">{clock12(row.day.check_in)}</b>{row.day.check_out && <> · <b className="af-time-out">{clock12(row.day.check_out)}</b></>}
              </span></span>}
              <span className="att-tags">
                <Pill tone={STATE[row.state].tone}>{STATE[row.state].label}</Pill>
                {!!row.day?.late_minutes && <Pill tone="warn" dot={false}>{row.day.late_minutes} دقيقة تأخير</Pill>}
                {row.day?.approval_status === 'approved' && <Pill tone="brand" dot={false}>معتمد</Pill>}
              </span>
            </button>

          </li>
        ))}
      </ul>
    </div>
  )
}

function AttendanceOverview({ date, onDateChange, onSelect }: { date: string; onDateChange(date: string): void; onSelect(id: number, date: string): void }) {
  const [attentionOnly, setAttentionOnly] = useState(false)
  const { data, error, loading, reload } = useLoad<{
    date: string; branches: Array<{ id: number; name: string } & BoardData['summary']>
  }>(`/attendance/overview?date=${date}`)
  const current = data?.date === date ? data : null
  const rows = (current?.branches ?? []).filter((branch) => !attentionOnly || branch.absent > 0 || branch.pending > 0)
  const totals = (current?.branches ?? []).reduce((sum, row) => ({
    present: sum.present + row.present,
    late: sum.late + row.late,
    absent: sum.absent + row.absent,
    pending: sum.pending + row.pending,
  }), { present: 0, late: 0, absent: 0, pending: 0 })

  return (
    <section className="af-attendance-overview">
      <div className="af-toolbar">
        <input className="input num af-date" type="date" value={date} max={todayGaza()} aria-label="تاريخ كشف الفروع"
          onChange={(event) => { if (event.target.value) onDateChange(event.target.value) }} />
        <Button aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}>فروع تحتاج إلى متابعة</Button>
        <Button busy={loading} onClick={() => void reload()}>تحديث</Button>
      </div>
      <ErrorBanner text={error} />
      {loading && !current && <Loading />}
      {current && <>
        <div className="dash-kpis">
          <div className="dash-kpi glass" data-tone="ok"><span className="dash-kpi-l">سجّلوا الحضور</span><b className="dash-kpi-n num">{totals.present}</b></div>
          <div className="dash-kpi glass" data-tone="warn"><span className="dash-kpi-l">المتأخرون</span><b className="dash-kpi-n num">{totals.late}</b></div>
          <div className="dash-kpi glass" data-tone="danger"><span className="dash-kpi-l">الغائبون</span><b className="dash-kpi-n num">{totals.absent}</b></div>
          <div className="dash-kpi glass" data-tone="info"><span className="dash-kpi-l">سجلات بانتظار الاعتماد</span><b className="dash-kpi-n num">{totals.pending}</b></div>
        </div>
        <div className="card glass af-attendance-table">
          <ScrollTable label="حضور الفروع">
            <table className="tbl">
              <thead><tr><th scope="col">الفرع</th><th scope="col">المتوقع حضورهم</th><th scope="col">الحاضرون</th><th scope="col">المتأخرون</th><th scope="col">الغائبون</th><th scope="col">بانتظار الاعتماد</th><th scope="col">الكشف</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td className="num">{row.expected}</td><td className="num">{row.present}</td><td className="num">{row.late}</td>
                <td className="num">{row.absent}</td><td className="num">{row.pending}</td>
                <td><Button onClick={() => onSelect(row.id, date)}>عرض كشف {row.name}</Button></td>
              </tr>)}</tbody>
            </table>
          </ScrollTable>
          {!rows.length && <p className="af-pad">{attentionOnly ? 'لا توجد فروع تحتاج إلى متابعة لهذا اليوم.' : 'لا توجد فروع متاحة للعرض.'}</p>}
        </div>
      </>}
    </section>
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
          <Field label="الحضور" error={fields.check_in}>{(id) => <TimeField id={id} label="وقت الحضور" value={inT} onChange={setIn} />}</Field>
          <Field label="الانصراف" error={fields.check_out}>{(id) => <TimeField id={id} label="وقت الانصراف" value={outT} onChange={setOut} />}</Field>
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

function DayHistory({ row, onClose, onEdit }: { row: BoardRow; onClose(): void; onEdit?(): void }) {
  const { data, error, loading } = useLoad<HistoryData>(`/attendance/days/${row.day!.id}/history`)
  const t = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Gaza' }).format(new Date(iso))
  return (
    <Dialog open onClose={onClose} title={row.user.name} subtitle={row.day ? dayName(row.day.date) : undefined} icon={<History size={20} />} footer={<>
      <Button onClick={onClose}>إغلاق</Button>{onEdit && <Button variant="primary" icon={<Pencil size={17} />} onClick={onEdit}>تعديل سجل اليوم</Button>}
    </>}>
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : data && (
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
