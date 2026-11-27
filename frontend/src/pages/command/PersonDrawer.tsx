import { BadgeCheck, Briefcase, Building2, CalendarDays, Check, Clock3, ExternalLink, HandCoins, Mail, MapPin, Minus, Palmtree, Pencil, Phone, Plus, Send, Wrench, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { clock12 } from '../../lib/format'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { api, ApiError } from '../../api/client'
import { STATUS_LABEL, type EmployeeFile } from '../../api/types'
import { can, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { NxAvatar, NxTabs, type Hue } from '../../ui/nx'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { hm, STATE, type Row } from './CommandCenter'
import { NotesTab } from './Extras'

type CalDay = { date: string; state: 'present' | 'late' | 'absent' | 'leave' | 'off' | 'scheduled'; in: string | null; out: string | null; minutes: number; permission: boolean }
type Task = { id: number; number: number; type: string | null; status: string; subscriber: string | null; expected_minutes: number | null; minutes: number | null; late: boolean; sent_at: string | null; completed_at: string | null }
type Leave = { id: number; kind: string; status: string; starts: string; ends: string; days: number; reason: string; from_time: string | null; to_time: string | null }

const CAL: Record<CalDay['state'], { label: string; hue: Hue }> = { present: { label: 'حضور', hue: 'mint' }, late: { label: 'تأخير', hue: 'amber' }, absent: { label: 'غياب', hue: 'rose' }, leave: { label: 'إجازة', hue: 'sky' }, off: { label: 'راحة', hue: 'slate' }, scheduled: { label: 'لم يأتِ', hue: 'slate' } }
const TASK: Record<string, { label: string; hue: Hue }> = { new: { label: 'لم تُرسل', hue: 'slate' }, sent: { label: 'أُرسلت', hue: 'sky' }, seen: { label: 'فتحها', hue: 'sky' }, in_progress: { label: 'قيد التنفيذ', hue: 'violet' }, done: { label: 'أُنجزت', hue: 'mint' }, cancelled: { label: 'أُلغيت', hue: 'slate' } }
const LEAVE_KIND: Record<string, string> = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', other: 'إجازة أخرى', permission: 'إذن بالساعات' }
const LEAVE_ST: Record<string, { label: string; hue: Hue }> = { pending: { label: 'بانتظار القرار', hue: 'amber' }, escalated: { label: 'عند الإدارة', hue: 'violet' }, approved: { label: 'موافق عليه', hue: 'mint' }, rejected: { label: 'مرفوض', hue: 'rose' }, cancelled: { label: 'ملغى', hue: 'slate' } }
const STATUS_HUE: Record<string, Hue> = { active: 'mint', trainee: 'sky', suspended: 'amber', terminated: 'rose' }
const liveMinutes = (from: string) => { const [h, m] = from.split(':').map(Number); const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit' }).split(':').map(Number); return Math.max(0, ((now[0] ?? 0) * 60 + (now[1] ?? 0)) - ((h ?? 0) * 60 + (m ?? 0))) }
const dm = (iso: string) => new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
const wd = (iso: string) => new Intl.DateTimeFormat('ar-EG', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
type Tab = 'over' | 'att' | 'tasks' | 'leaves' | 'notes' | 'info'

/** The quick file: slides in over the board with everything about one person and the few things you would do next. */
export function PersonDrawer({ id, today, canEditDay, onEditDay, onClose }: { id: number; today: Row | null; canEditDay(r: Row): boolean; onEditDay(r: Row): void; onClose(): void }) {
  const me = useUser()
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date()).slice(0, 7)
  const file = useLoad<EmployeeFile>(`/employees/${id}`)
  const over = useLoad<{ calendar: CalDay[]; leave_counts: Record<string, number> }>(`/employees/${id}/overview?month=${month}`)
  const extra = useLoad<{ tasks: Task[] | null; leaves: Leave[] | null }>(`/command/people/${id}`)
  const [tab, setTab] = useState<Tab>('over')
  const [sheet, setSheet] = useState<'msg' | 'adj' | null>(null)
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); window.setTimeout(onClose, 260) }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const f = file.data
  const days = over.data?.calendar ?? []
  const worked = days.filter((d) => d.state === 'present' || d.state === 'late')
  const workDays = days.filter((d) => d.state !== 'off' && d.state !== 'scheduled').length
  const leaves = extra.data?.leaves ?? null
  const tasks = extra.data?.tasks ?? null
  const pendingLeaves = (leaves ?? []).filter((l) => l.status === 'pending' || l.status === 'escalated').length
  const openTasks = (tasks ?? []).filter((t) => !['done', 'cancelled'].includes(t.status)).length
  const st = today ? STATE[today.state] : null

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'over', label: 'نظرة' }, { key: 'att', label: 'الحضور' },
    ...(tasks ? [{ key: 'tasks' as const, label: 'المهام', count: openTasks }] : []),
    ...(leaves ? [{ key: 'leaves' as const, label: 'الإجازات', count: pendingLeaves }] : []),
    { key: 'notes', label: 'ملاحظات' },
    { key: 'info', label: 'البيانات' },
  ]

  return createPortal(
    <div className="pd-layer" data-closing={closing || undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <aside className="pd" role="dialog" aria-modal="true" aria-label={f ? `ملف ${f.user.name}` : 'ملف الموظف'}>
        <header className="pd-cover">
          <button type="button" className="pd-x" onClick={close} aria-label="إغلاق"><X size={18} /></button>
          <span className="pd-cover-t">الملف السريع</span>
        </header>
        <div className="pd-id">
          <span className="pd-photo">{f ? <NxAvatar name={f.user.name} size={76} /> : <i className="pd-skel-ava" />}</span>
          <div className="pd-id-t">
            <h2>{f?.user.name ?? '…'}</h2>
            <p>{f ? [f.job.job_title ?? f.user.role?.name, f.job.department?.name].filter(Boolean).join(' · ') || '—' : ' '}</p>
            <div className="pd-chips">
              {f && <span className="nx-chip" data-hue="slate"><Building2 size={12} /> {f.user.branch?.name ?? 'الإدارة العامة'}</span>}
              {f && <span className="nx-chip nx-chip-dot" data-hue={STATUS_HUE[f.status] ?? 'slate'}>{STATUS_LABEL[f.status]}</span>}
              {st && <span className="nx-chip nx-chip-dot" data-hue={st.hue}>اليوم: {st.label}</span>}
            </div>
          </div>
        </div>

        <div className="pd-actions">
          <Link to={`/employees/${id}`} className="pd-act" onClick={close}><span><ExternalLink size={17} /></span>الملف الكامل</Link>
          {today && canEditDay(today) && <button type="button" className="pd-act" onClick={() => onEditDay(today)}><span><Clock3 size={17} /></span>حضور اليوم</button>}
          <button type="button" className="pd-act" aria-pressed={sheet === 'msg'} onClick={() => setSheet(sheet === 'msg' ? null : 'msg')}><span><Mail size={17} /></span>رسالة</button>
          {can(me, 'payroll.manage') && <button type="button" className="pd-act" aria-pressed={sheet === 'adj'} onClick={() => setSheet(sheet === 'adj' ? null : 'adj')}><span><HandCoins size={17} /></span>مكافأة أو خصم</button>}
          {can(me, 'tasks.manage') && f?.user.branch && <Link to="/tasks" className="pd-act" onClick={close}><span><Wrench size={17} /></span>إسناد مهمة</Link>}
        </div>
        {sheet === 'msg' && f && <MessageSheet to={f.user.id} name={f.user.name} onDone={() => setSheet(null)} />}
        {sheet === 'adj' && f && <AdjustSheet userId={f.user.id} month={month} canDeduct={can(me, 'payroll.deductions')} onDone={() => setSheet(null)} />}

        <NxTabs label="أقسام الملف السريع" tabs={tabs} value={tab} onChange={(v) => setTab(v as Tab)} />

        <div className="pd-body" key={tab}>
          {tab === 'over' && <>
            <div className="pd-stats">
              <Stat icon={<CalendarDays size={16} />} hue="mint" label="أيام الحضور" value={worked.length} unit={workDays ? `من ${workDays}` : undefined} />
              <Stat icon={<Clock3 size={16} />} hue="amber" label="مرات التأخير" value={days.filter((d) => d.state === 'late').length} />
              <Stat icon={<Briefcase size={16} />} hue="violet" label="ساعات العمل" value={Math.round(days.reduce((n, d) => n + d.minutes, 0) / 60)} unit="ساعة" />
              <Stat icon={<Palmtree size={16} />} hue="sky" label="رصيد الإجازة" value={f?.annual_leave.days == null ? '—' : f.annual_leave.days - f.annual_leave.used} unit={f?.annual_leave.days == null ? undefined : 'يوم'} />
            </div>
            <section className="pd-card">
              <h3>هذا الشهر يوماً بيوم</h3>
              <div className="pd-strip">{days.map((d) => <i key={d.date} data-hue={CAL[d.state].hue} data-state={d.state} title={`${dm(d.date)} · ${CAL[d.state].label}${d.in ? ` · ${clock12(d.in)} – ${clock12(d.out) || '…'}` : ''}`} />)}</div>
              <div className="pd-legend">{(['present', 'late', 'absent', 'leave'] as const).map((s) => <span key={s} data-hue={CAL[s].hue}><i />{CAL[s].label} <b className="num">{days.filter((d) => d.state === s).length}</b></span>)}</div>
            </section>
            {today?.day && <section className="pd-card pd-today">
              <h3>اليوم</h3>
              <div className="pd-today-row num"><span>{clock12(today.day.check_in) || '—'}</span><i /><span>{clock12(today.day.check_out) || '—'}</span></div>
              <p>{hm(today.day.check_out || !today.day.check_in ? today.day.worked_minutes : liveMinutes(today.day.check_in))} عمل{!today.day.check_out && today.day.check_in ? ' حتى الآن' : ''}{today.day.late_minutes ? ` · ${hm(today.day.late_minutes)} تأخير` : ''}{today.day.overtime_minutes ? ` · ${hm(today.day.overtime_minutes)} إضافي` : ''}</p>
            </section>}
            {pendingLeaves > 0 && <button type="button" className="pd-alert" onClick={() => setTab('leaves')}><Palmtree size={17} /> لديه {pendingLeaves} {pendingLeaves === 1 ? 'طلب' : 'طلبات'} بانتظار القرار</button>}
          </>}

          {tab === 'att' && <div className="pd-list">
            {[...days].reverse().filter((d) => d.state !== 'scheduled').map((d) => (
              <div key={d.date} className="pd-li">
                <span className="pd-li-d"><b className="num">{Number(d.date.slice(-2))}</b><small>{wd(d.date)}</small></span>
                <span className="nx-chip" data-hue={CAL[d.state].hue}>{CAL[d.state].label}{d.permission ? ' · بإذن' : ''}</span>
                <span className="pd-li-t num">{clock12(d.in) || '—'} – {clock12(d.out) || '—'}</span>
                <b className="num">{d.minutes ? hm(d.minutes) : '—'}</b>
              </div>
            ))}
            {days.length === 0 && <p className="pd-empty">لا توجد أيام هذا الشهر.</p>}
          </div>}

          {tab === 'tasks' && <div className="pd-list">
            {(tasks ?? []).map((t) => (
              <div key={t.id} className="pd-li pd-task">
                <span className="pd-task-n num">#{t.number}</span>
                <span className="pd-task-t"><b>{t.type ?? 'مهمة'}</b><small>{t.subscriber ?? '—'} · {t.sent_at ? dm(t.sent_at) : '—'}</small></span>
                <span className="nx-chip" data-hue={t.late ? 'rose' : TASK[t.status]?.hue ?? 'slate'}>{t.late ? 'متأخرة' : TASK[t.status]?.label ?? t.status}</span>
                <span className="pd-task-m num">{t.minutes != null ? <>{hm(t.minutes)}{t.expected_minutes ? <small> / {hm(t.expected_minutes)}</small> : null}</> : t.expected_minutes ? <small>متوقع {hm(t.expected_minutes)}</small> : '—'}</span>
              </div>
            ))}
            {(tasks ?? []).length === 0 && <p className="pd-empty">لا مهام ميدانية في آخر 30 يوماً.</p>}
          </div>}

          {tab === 'leaves' && <LeavesTab leaves={leaves ?? []} canDecide={can(me, 'leaves.decide')} canFinal={can(me, 'leaves.final')} reload={() => void extra.reload()} />}

          {tab === 'notes' && <NotesTab userId={id} canWrite={(can(me, 'employees.manage') || can(me, 'leaves.final')) && id !== me.id} />}
          {tab === 'info' && f && <dl className="pd-info">
            <Info icon={<Phone size={15} />} k="الجوال" v={f.personal.phone} num />
            <Info icon={<MapPin size={15} />} k="السكن" v={f.personal.address} />
            <Info icon={<CalendarDays size={15} />} k="تاريخ التوظيف" v={f.job.hire_date} num />
            <Info icon={<Clock3 size={15} />} k="الدوام" v={`${f.job.schedule?.name ?? 'الأساسي للفرع'} · ${Number(f.job.daily_hours)} ساعات`} />
            <Info icon={<Briefcase size={15} />} k="نوع الأجر" v={f.job.salary_type ? { monthly: 'شهري', weekly: 'أسبوعي', daily: 'يومي', contract: 'مقاولة' }[f.job.salary_type] ?? f.job.salary_type : null} />
            <Info icon={<BadgeCheck size={15} />} k="الحضور" v={f.job.tracks_attendance ? (f.job.punch_anywhere ? 'يسجّل من أي مكان' : 'يسجّل من المكتب') : 'لا يسجّل'} />
          </dl>}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function Stat({ icon, hue, label, value, unit }: { icon: ReactNode; hue: Hue; label: string; value: number | string; unit?: string }) {
  return <div className="pd-stat" data-hue={hue}><span className="pd-stat-i">{icon}</span><small>{label}</small><b className="num">{value}{unit && <em>{unit}</em>}</b></div>
}
function Info({ icon, k, v, num }: { icon: ReactNode; k: string; v: string | null | undefined; num?: boolean }) {
  return <div><dt>{icon}{k}</dt><dd className={num ? 'num' : undefined} dir={num && v ? 'ltr' : undefined} data-empty={!v || undefined}>{v || 'غير مُدخل'}</dd></div>
}

function LeavesTab({ leaves, canDecide, canFinal, reload }: { leaves: Leave[]; canDecide: boolean; canFinal: boolean; reload(): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<number | null>(null)
  async function decide(l: Leave, action: 'approved' | 'rejected') {
    if (action === 'rejected' && !(await confirm({ title: 'رفض الطلب؟', confirmLabel: 'رفض', danger: true }))) return
    setBusy(l.id)
    try { await api(`/leaves/${l.id}`, { method: 'PATCH', body: { action } }); toast(action === 'approved' ? 'تمت الموافقة' : 'رُفض الطلب'); reload() }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر حفظ القرار.', 'danger') } finally { setBusy(null) }
  }
  return <div className="pd-list">
    {leaves.map((l) => {
      const decidable = (l.status === 'pending' && canDecide) || (l.status === 'escalated' && canFinal)
      return (
        <div key={l.id} className="pd-leave" data-pending={decidable || undefined}>
          <div className="pd-leave-top"><b>{LEAVE_KIND[l.kind] ?? l.kind}</b><span className="nx-chip nx-chip-dot" data-hue={LEAVE_ST[l.status]?.hue ?? 'slate'}>{LEAVE_ST[l.status]?.label ?? l.status}</span></div>
          <small className="num">{l.kind === 'permission' ? `${dm(l.starts)} · ${clock12(l.from_time?.slice(0, 5))} – ${clock12(l.to_time?.slice(0, 5))}` : `${dm(l.starts)} – ${dm(l.ends)} · ${l.days} ${l.days === 1 ? 'يوم' : 'أيام'}`}</small>
          <p>{l.reason}</p>
          {decidable && <div className="pd-leave-act">
            <Button variant="primary" className="sm" icon={<Check size={15} />} busy={busy === l.id} onClick={() => void decide(l, 'approved')}>موافقة</Button>
            <Button className="sm" icon={<X size={15} />} disabled={busy === l.id} onClick={() => void decide(l, 'rejected')}>رفض</Button>
          </div>}
        </div>
      )
    })}
    {leaves.length === 0 && <p className="pd-empty">لا طلبات إجازة.</p>}
  </div>
}

function MessageSheet({ to, name, onDone }: { to: number; name: string; onDone(): void }) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    try { await api('/messages', { method: 'POST', body: { to: [to], subject: subject.trim() || 'رسالة من الإدارة', body: body.trim() } }); toast(`أُرسلت الرسالة إلى ${name}`); onDone() }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الإرسال.', 'danger') } finally { setBusy(false) }
  }
  return <div className="pd-sheet">
    <input className="input" placeholder="الموضوع (اختياري)" value={subject} onChange={(e) => setSubject(e.target.value)} />
    <textarea className="input textarea" rows={3} placeholder={`اكتب رسالتك إلى ${name}…`} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
    <div className="pd-sheet-bar"><Button variant="ghost" className="sm" onClick={onDone}>إلغاء</Button><Button variant="primary" className="sm" icon={<Send size={15} />} busy={busy} disabled={!body.trim()} onClick={() => void send()}>إرسال</Button></div>
  </div>
}

function AdjustSheet({ userId, month, canDeduct, onDone }: { userId: number; month: string; canDeduct: boolean; onDone(): void }) {
  const toast = useToast()
  const [type, setType] = useState<'bonus' | 'deduction'>('bonus')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await api('/payroll/adjustments', { method: 'POST', body: { user_id: userId, type, month, amount: Number(amount), reason: reason.trim() } }); toast(type === 'bonus' ? 'أُضيفت المكافأة' : 'أُضيف الخصم'); onDone() }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ.', 'danger') } finally { setBusy(false) }
  }
  return <div className="pd-sheet">
    <div className="pd-adj-types">
      <button type="button" data-hue="mint" aria-pressed={type === 'bonus'} onClick={() => setType('bonus')}><Plus size={15} /> مكافأة</button>
      {canDeduct && <button type="button" data-hue="rose" aria-pressed={type === 'deduction'} onClick={() => setType('deduction')}><Minus size={15} /> خصم</button>}
    </div>
    <div className="pd-adj-row">
      <span className="nxx-money"><input className="input num" inputMode="decimal" dir="ltr" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="المبلغ" /><i>₪</i></span>
      <input className="input" placeholder={type === 'bonus' ? 'السبب: مثال إنجاز مميز' : 'السبب'} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="السبب" />
    </div>
    <small className="pd-sheet-hint">يدخل في أول دفعة رواتب لهذا الشهر.</small>
    <div className="pd-sheet-bar"><Button variant="ghost" className="sm" onClick={onDone}>إلغاء</Button><Button variant="primary" className="sm" icon={<Pencil size={15} />} busy={busy} disabled={!amount || !reason.trim()} onClick={() => void save()}>حفظ</Button></div>
  </div>
}
