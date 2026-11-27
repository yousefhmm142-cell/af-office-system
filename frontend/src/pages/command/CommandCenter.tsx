import { AlarmClock, Building2, FileText, Minimize2, MonitorPlay, CalendarCheck, CalendarRange, ChevronLeft, Clock3, LayoutList, ListTodo, Palmtree, Pencil, Rows3, Search, Sparkles, UserCheck, UserX, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { clock12 } from '../../lib/format'
import { can, useUser } from '../../app/auth'
import { firstName, formatLongDate, formatWeekday, greeting } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { ChoiceField } from '../../ui/ChoiceField'
import { ErrorBanner } from '../../ui/Field'
import { NxAvatar, type Hue } from '../../ui/nx'
import type { Dashboard } from '../Home'
import { Alerts, BranchMap, Decisions, FieldNow, WeekBrief, type CenterData } from './Center'
import { HrFollow, TwoWeeks } from './Extras'
import { ReportDialog } from './ReportDialog'
import { askAssistant } from '../../app/Assistant'
import { DayDialog } from './DayDialog'
import { PersonDrawer } from './PersonDrawer'

export type State = 'present' | 'late' | 'left' | 'absent' | 'leave' | 'off' | 'not_yet'
export type Day = { id: number; user_id: number; date: string; check_in: string | null; check_out: string | null; worked_minutes: number; late_minutes: number; overtime_minutes: number; manually_edited: boolean; approval_status: string; recorded_offline: boolean }
export type Row = { user: { id: number; name: string; job_title: string | null; department: string | null; branch_id: number }; state: State; permission: string | null; schedule_name: string | null; schedule: string | null; day: Day | null }
type Totals = { days: number; late_days: number; late_minutes: number; worked_minutes: number; overtime_minutes: number; pending: number }
export type Board = { date: string; now: string; branches: Array<{ id: number; name: string; can_manage: boolean }>; rows: Row[]; totals: Record<string, Totals> | null }

export const STATE: Record<State, { label: string; hue: Hue }> = {
  present: { label: 'حاضر', hue: 'mint' }, late: { label: 'متأخر', hue: 'amber' }, left: { label: 'انصرف', hue: 'violet' },
  absent: { label: 'غائب', hue: 'rose' }, leave: { label: 'في إجازة', hue: 'sky' }, off: { label: 'راحة', hue: 'slate' }, not_yet: { label: 'لم يصل بعد', hue: 'slate' },
}
type Period = 'today' | 'week' | 'month'
type Pulse = 'all' | 'in' | 'late' | 'out' | 'leave' | 'pending'

const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(d)
export const hm = (m: number) => (m <= 0 ? '0' : m < 60 ? `${m}د` : `${Math.floor(m / 60)}س${m % 60 ? ` ${m % 60}د` : ''}`)
const toMin = (t: string | null | undefined) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }

/** The executive board for HR, management and the system admin: the company's pulse, everyone's day, one tap to act. */
export function CommandCenter() {
  const me = useUser()
  const [period, setPeriod] = useState<Period>('today')
  const [branch, setBranch] = useState('')
  const [dept, setDept] = useState('')
  const [shift, setShift] = useState('')
  const [q, setQ] = useState('')
  const [pulse, setPulse] = useState<Pulse>('all')
  const [grouped, setGrouped] = useState(true)
  const [person, setPerson] = useState<number | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [tv, setTv] = useState(false)
  const [report, setReport] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = () => { if (!document.fullscreenElement) setTv(false) }
    document.addEventListener('fullscreenchange', off); return () => document.removeEventListener('fullscreenchange', off)
  }, [])
  const toggleTv = () => {
    if (tv) { setTv(false); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); return }
    setTv(true); void rootRef.current?.requestFullscreen?.().catch(() => undefined)
  }
  const searchRef = useRef<HTMLInputElement>(null)

  const today = iso(new Date())
  const from = period === 'week' ? iso(new Date(Date.now() - 6 * 864e5)) : period === 'month' ? `${today.slice(0, 8)}01` : null
  const board = useLoad<Board>(`/command/attendance${from ? `?from=${from}&to=${today}` : ''}`)
  const dash = useLoad<Dashboard>('/dashboard')
  const center = useLoad<CenterData>('/command/center')
  const boardRef = useRef<HTMLElement>(null)
  const [stamp, setStamp] = useState(() => Date.now())
  const [now, setNow] = useState(() => new Date())

  // Live: the board refreshes every minute; the clock every second.
  useEffect(() => { const t = window.setInterval(() => { void board.reload().then(() => setStamp(Date.now())); void dash.reload(); void center.reload() }, 60_000); return () => window.clearInterval(t) }, [board.reload, dash.reload, center.reload]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t) }, [])
  useEffect(() => { if (board.data) setStamp(Date.now()) }, [board.data])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  const data = board.data
  const branchName = useMemo(() => new Map((data?.branches ?? []).map((b) => [b.id, b.name])), [data])
  const depts = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.user.department).filter(Boolean) as string[])].sort(), [data])
  const shifts = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.schedule_name).filter(Boolean) as string[])].sort(), [data])

  const base = useMemo(() => (data?.rows ?? []).filter((r) =>
    (!branch || r.user.branch_id === Number(branch)) && (!dept || r.user.department === dept) && (!shift || r.schedule_name === shift)
    && (!q.trim() || r.user.name.includes(q.trim()) || (r.user.job_title ?? '').includes(q.trim()))), [data, branch, dept, shift, q])

  const isIn = (r: Row) => r.state === 'present' || r.state === 'late' || r.state === 'left'
  const counts = {
    all: base.length,
    in: base.filter(isIn).length,
    late: base.filter((r) => (r.day?.late_minutes ?? 0) > 0).length,
    out: base.filter((r) => r.state === 'absent' || r.state === 'not_yet').length,
    leave: base.filter((r) => r.state === 'leave').length,
    pending: base.filter((r) => r.day?.approval_status === 'pending').length,
  }
  const expected = base.filter((r) => r.state !== 'off' && r.state !== 'leave').length
  // Field work comes from the decision centre, which follows it for HR and not for management.
  const taskBranches = (center.data?.branches ?? []).filter((b) => b.tasks && (!branch || b.id === Number(branch)))
  const followsTasks = taskBranches.length > 0
  const openTasks = taskBranches.reduce((n, b) => n + (b.tasks?.open ?? 0), 0)
  const lateTasks = taskBranches.reduce((n, b) => n + (b.tasks?.overdue ?? 0), 0)

  const shown = base.filter((r) => pulse === 'all' ? true : pulse === 'in' ? isIn(r) : pulse === 'late' ? (r.day?.late_minutes ?? 0) > 0
    : pulse === 'out' ? r.state === 'absent' || r.state === 'not_yet' : pulse === 'leave' ? r.state === 'leave' : r.day?.approval_status === 'pending')
  const order: Record<State, number> = { late: 0, absent: 1, not_yet: 2, present: 3, left: 4, leave: 5, off: 6 }
  const sorted = [...shown].sort((a, b) => order[a.state] - order[b.state] || a.user.name.localeCompare(b.user.name, 'ar'))

  const totals = data?.totals ?? null
  const sumT = (k: keyof Totals) => base.reduce((n, r) => n + (totals?.[r.user.id]?.[k] ?? 0), 0)
  const ago = Math.max(0, Math.round((now.getTime() - stamp) / 1000))

  const cards: Array<{ key: Pulse; label: string; value: number | string; unit?: string; sub: string; hue: Hue; icon: ReactNode; ring?: number }> = period === 'today' ? [
    { key: 'all', label: 'الموظفون', value: counts.all, sub: `${data?.branches.length ?? 0} فروع`, hue: 'violet', icon: <Users size={19} /> },
    { key: 'in', label: 'حضروا اليوم', value: counts.in, unit: expected ? `من ${expected}` : undefined, sub: expected ? `${Math.round((counts.in / expected) * 100)}% نسبة الحضور` : '—', hue: 'mint', icon: <UserCheck size={19} />, ring: expected ? counts.in / expected : 0 },
    { key: 'late', label: 'متأخرون', value: counts.late, sub: counts.late ? `${hm(base.reduce((n, r) => n + (r.day?.late_minutes ?? 0), 0))} تأخير مجموع` : 'لا تأخير اليوم', hue: 'amber', icon: <AlarmClock size={19} /> },
    { key: 'out', label: 'لم يحضروا', value: counts.out, sub: `${base.filter((r) => r.state === 'absent').length} غائب · ${base.filter((r) => r.state === 'not_yet').length} لم يصل بعد`, hue: 'rose', icon: <UserX size={19} /> },
    { key: 'leave', label: 'في إجازة', value: counts.leave, sub: base.some((r) => r.permission) ? `${base.filter((r) => r.permission).length} بإذن ساعات` : 'إجازات معتمدة', hue: 'sky', icon: <Palmtree size={19} /> },
    followsTasks
      ? { key: 'pending', label: 'مهام مفتوحة', value: openTasks, sub: lateTasks ? `${lateTasks} متأخرة عن وقتها` : 'لا مهام متأخرة', hue: 'amber', icon: <ListTodo size={19} /> }
      : { key: 'pending', label: 'بانتظار الاعتماد', value: counts.pending, sub: 'أيام حضور اليوم', hue: 'amber', icon: <CalendarRange size={19} /> },
  ] : [
    { key: 'all', label: 'الموظفون', value: counts.all, sub: period === 'week' ? 'آخر 7 أيام' : 'منذ بداية الشهر', hue: 'violet', icon: <Users size={19} /> },
    { key: 'in', label: 'أيام حضور', value: sumT('days'), sub: 'مجموع الأيام المسجلة', hue: 'mint', icon: <CalendarCheck size={19} /> },
    { key: 'late', label: 'مرات التأخير', value: sumT('late_days'), sub: `${hm(sumT('late_minutes'))} مجموع التأخير`, hue: 'amber', icon: <AlarmClock size={19} /> },
    { key: 'out', label: 'ساعات العمل', value: Math.round(sumT('worked_minutes') / 60), unit: 'ساعة', sub: 'مجموع الساعات', hue: 'sky', icon: <Clock3 size={19} /> },
    { key: 'leave', label: 'العمل الإضافي', value: Math.round(sumT('overtime_minutes') / 60), unit: 'ساعة', sub: 'فوق ساعات الدوام', hue: 'violet', icon: <Sparkles size={19} /> },
    { key: 'pending', label: 'بانتظار الاعتماد', value: sumT('pending'), sub: 'أيام سابقة', hue: 'rose', icon: <CalendarRange size={19} /> },
  ]

  function reportLines(): string[] {
    const c = center.data
    const out = [`تقرير اليوم · ${formatWeekday(now)} ${formatLongDate(now)}`, '',
      `الحضور: ${counts.in} من ${expected}${expected ? ` (${Math.round((counts.in / expected) * 100)}%)` : ''}`,
      `متأخرون: ${counts.late} · لم يحضروا: ${counts.out} · في إجازة: ${counts.leave}`]
    if (c) {
      out.push('', 'الفروع:')
      c.branches.forEach((b) => { if (b.attendance) out.push(`• ${b.name}: ${b.attendance.present}/${b.attendance.expected} حاضر${b.attendance.late ? `، ${b.attendance.late} متأخر` : ''}${b.attendance.absent ? `، ${b.attendance.absent} غائب` : ''}${b.tasks?.overdue ? `، ${b.tasks.overdue} مهمة متأخرة` : ''}`) })
      const d = c.decisions
      const waiting = d.leaves.length + d.batches.length
      if (waiting) out.push('', `ينتظر القرار: ${d.leaves.length} طلب إجازة، ${d.batches.length} دفعة رواتب`)
      if (c.week.this.on_time != null) out.push(`الالتزام بالموعد هذا الأسبوع: ${c.week.this.on_time}%`)
    }
    return out
  }

  const groups = grouped ? [...new Set(sorted.map((r) => r.user.branch_id))].map((id) => ({ id, rows: sorted.filter((r) => r.user.branch_id === id) })) : [{ id: 0, rows: sorted }]
  const canManage = (r: Row) => !!data?.branches.find((b) => b.id === r.user.branch_id)?.can_manage && r.user.id !== me.id

  return (
    <div className="nx cc" ref={rootRef} data-tv={tv || undefined}>
      {/* ——— greeting, live clock, filters ——— */}
      <header className="cc-top">
        <div className="cc-hello">
          <span className="cc-eyebrow"><i className="cc-live" /> لوحة القيادة · {formatWeekday(now)} {formatLongDate(now)}</span>
          <h1>{greeting(now)}، {firstName(me.name)}</h1>
          <p>{counts.in && period === 'today' ? `حضر ${counts.in} من ${expected} حتى الآن${counts.late ? `، وتأخر ${counts.late}` : ''}.` : 'نظرة واحدة على الشركة كلها.'}</p>
        </div>
        <div className="cc-clock" aria-label="الساعة الآن">
          <b className="num"><span dir="ltr">{clock12(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit' })).replace(/ (ص|م)$/, '')}<small>:{now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Gaza', second: '2-digit' }).padStart(2, '0')}</small></span><em>{Number(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit' })) < 12 ? 'صباحاً' : 'مساءً'}</em></b>
          <span>{board.loading && data ? 'جارٍ التحديث…' : `حُدّث قبل ${ago < 60 ? `${ago} ث` : `${Math.round(ago / 60)} د`}`}</span>
        </div>
      </header>
      <div className="cc-tools">
        <button type="button" className="cc-tool cc-tool-ai" onClick={() => askAssistant('لخّص لي وضع الشركة اليوم في فقرة قصيرة: الحضور والتأخير والغياب، وما ينتظر قراري، وأي فرع يحتاج انتباهاً، وأهم ما يجب أن أفعله الآن.')}><Sparkles size={17} /> لخّص لي اليوم</button>
        <button type="button" className="cc-tool" onClick={() => setReport(true)}><FileText size={17} /> تقرير اليوم</button>
        <button type="button" className="cc-tool" onClick={toggleTv} aria-pressed={tv}>{tv ? <Minimize2 size={17} /> : <MonitorPlay size={17} />} {tv ? 'إنهاء شاشة المكتب' : 'شاشة المكتب'}</button>
      </div>

      <div className="cc-filters">
        <div className="cc-seg" role="radiogroup" aria-label="الفترة">
          {([['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => { setPeriod(k); setPulse('all') }}>{l}</button>
          ))}
        </div>
        <label className="cc-search"><Search size={17} aria-hidden="true" /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الموظف أو مسماه" aria-label="بحث" />{q ? <button type="button" onClick={() => setQ('')} aria-label="مسح"><X size={15} /></button> : <kbd>/</kbd>}</label>
        {(data?.branches.length ?? 0) > 1 && (
          <ChoiceField className="input select cc-pick" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="الفرع">
            <option value="">كل الفروع</option>{data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </ChoiceField>
        )}
        {depts.length > 1 && (
          <ChoiceField className="input select cc-pick" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="القسم">
            <option value="">كل الأقسام</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </ChoiceField>
        )}
        {shifts.length > 1 && (
          <ChoiceField className="input select cc-pick" value={shift} onChange={(e) => setShift(e.target.value)} aria-label="الدوام">
            <option value="">كل الدوامات</option>{shifts.map((d) => <option key={d} value={d}>{d}</option>)}
          </ChoiceField>
        )}
        {(branch || dept || shift || q || pulse !== 'all') && <button type="button" className="cc-clear" onClick={() => { setBranch(''); setDept(''); setShift(''); setQ(''); setPulse('all') }}><X size={14} /> مسح الفلاتر</button>}
      </div>

      {/* ——— ① the pulse ——— */}
      <section className="cc-pulse" aria-label="نبض الشركة">
        {cards.map((c) => (
          <button key={c.key} type="button" className="cc-card" data-hue={c.hue} aria-pressed={pulse === c.key && c.key !== 'all'}
            onClick={() => setPulse(pulse === c.key ? 'all' : c.key)} disabled={period === 'today' && c.key === 'pending' && followsTasks}>
            <span className="cc-card-top"><span className="cc-card-ico">{c.icon}</span><span className="cc-card-l">{c.label}</span></span>
            <b className="cc-card-n num">{board.loading && !data ? '—' : c.value}{c.unit && <small>{c.unit}</small>}</b>
            <span className="cc-card-s">{c.sub}</span>
            {c.ring !== undefined && <span className="cc-card-bar"><i style={{ width: `${Math.round(c.ring * 100)}%` }} /></span>}
          </button>
        ))}
      </section>

      <div className="cc-grid">
      <div className="cc-main">
      {center.data && <BranchMap data={center.data} selected={branch} onPick={(id) => { setBranch(id); window.setTimeout(() => boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }} />}
      {/* ——— ② everyone's day ——— */}
      <section className="cc-board" ref={boardRef}>
        <header className="cc-board-head">
          <div>
            <h2>{period === 'today' ? 'الحضور الآن' : period === 'week' ? 'حضور الأسبوع' : 'حضور الشهر'}</h2>
            <span>{sorted.length} موظفاً{pulse !== 'all' ? ` · ${cards.find((c) => c.key === pulse)?.label}` : ''}</span>
          </div>
          <div className="cc-board-tools">
            <div className="cc-seg sm" role="radiogroup" aria-label="طريقة العرض">
              <button type="button" role="radio" aria-checked={grouped} onClick={() => setGrouped(true)} title="حسب الفرع"><Rows3 size={16} /> حسب الفرع</button>
              <button type="button" role="radio" aria-checked={!grouped} onClick={() => setGrouped(false)} title="قائمة واحدة"><LayoutList size={16} /> قائمة واحدة</button>
            </div>
          </div>
        </header>
        <ErrorBanner text={board.error} />
        {period === 'today' && <div className="cc-legend" aria-hidden="true"><span><i data-k="shift" /> وقت الدوام</span><span><i data-k="work" /> وقت العمل</span><span><i data-k="late" /> تأخير</span><span><i data-k="now" /> الآن</span></div>}
        {board.loading && !data ? <div className="cc-skel">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
          : sorted.length === 0 ? <div className="cc-empty"><Sparkles size={26} /><b>لا أحد هنا</b><span>جرّب فلترًا آخر.</span></div>
          : groups.map((g) => (
            <div key={g.id} className="cc-group">
              {grouped && <div className="cc-group-h"><Building2 size={15} /> {branchName.get(g.id)} <small className="num">{g.rows.filter(isIn).length}/{g.rows.filter((r) => r.state !== 'off' && r.state !== 'leave').length} حاضر</small></div>}
              <div className="cc-rows" role="list" data-grouped={grouped || undefined}>
                {g.rows.map((r) => period === 'today'
                  ? <TodayRow key={r.user.id} r={r} branch={branchName.get(r.user.branch_id) ?? ''} now={data!.now} manage={canManage(r)} onOpen={() => setPerson(r.user.id)} onEdit={() => setEditing(r)} />
                  : <PeriodRow key={r.user.id} r={r} t={totals?.[r.user.id]} branch={branchName.get(r.user.branch_id) ?? ''} onOpen={() => setPerson(r.user.id)} />)}
              </div>
            </div>
          ))}
      </section>
      </div>
      <aside className="cc-side" aria-label="مركز القرارات">
        {center.data ? <>
          <Decisions data={center.data} reload={() => { void center.reload(); void board.reload() }} />
          <Alerts data={center.data} onPerson={setPerson} />
          <HrFollow data={center.data} onPerson={setPerson} />
          <WeekBrief data={center.data} />
          <FieldNow data={center.data} onPerson={setPerson} />
          <TwoWeeks data={center.data} onPerson={setPerson} />
        </> : center.loading ? <div className="cc-skel">{Array.from({ length: 3 }, (_, i) => <i key={i} style={{ height: 160 }} />)}</div> : null}
      </aside>
      </div>

      {report && <ReportDialog onClose={() => setReport(false)} lines={reportLines()} />}
      {editing && <DayDialog row={editing} date={data!.date} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void board.reload() }} />}
      {person !== null && <PersonDrawer id={person} today={data?.rows.find((r) => r.user.id === person) ?? null} canEditDay={(r) => canManage(r)} onEditDay={(r) => setEditing(r)} onClose={() => setPerson(null)} />}
      {!can(me, 'users.view') && null}
    </div>
  )
}

/** One person's day as a line: the shift as a frame, the worked time filled in, the late part marked, now as a pin. */
function TodayRow({ r, branch, now, manage, onOpen, onEdit }: { r: Row; branch: string; now: string; manage: boolean; onOpen(): void; onEdit(): void }) {
  const S = 5 * 60, E = 21 * 60, span = E - S
  const pos = (m: number) => `${Math.min(100, Math.max(0, ((m - S) / span) * 100))}%`
  const [s0, s1] = (r.schedule ?? '').split('–').map(toMin)
  const tin = toMin(r.day?.check_in)
  const st = STATE[r.state]
  const late = r.day?.late_minutes ?? 0
  // Still at work: count the minutes up to now; but long after the shift ended it's a missing check-out, not work.
  const nowM = toMin(now) ?? 0
  const forgot = !!r.day?.check_in && !r.day.check_out && s1 != null && nowM > s1 + 120
  const live = r.day && !r.day.check_out && tin != null && !forgot ? Math.max(0, nowM - tin) : null
  const tout = toMin(r.day?.check_out) ?? (forgot ? s1! : r.day?.check_in ? nowM : null)
  const worked = live ?? (forgot && tin != null ? Math.max(0, s1! - tin) : r.day?.worked_minutes ?? 0)
  const barHue = r.state === 'left' ? 'violet' : r.state === 'present' || r.state === 'late' ? 'mint' : st.hue
  return (
    <div className="cc-row" role="listitem" data-state={r.state} onClick={onOpen} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <span className="cc-who">
        <span className="cc-ava" data-hue={st.hue}><NxAvatar name={r.user.name} size={40} /><i /></span>
        <span className="cc-who-t"><b>{r.user.name}</b><small>{[r.user.job_title, r.user.department].filter(Boolean).join(' · ') || '—'}</small></span>
      </span>
      <span className="cc-branch">{branch}</span>
      <span className="cc-times num" dir="ltr">
        <span data-on={!!r.day?.check_in || undefined}>{clock12(r.day?.check_in) || '—'}</span>
        <i>→</i>
        <span data-on={!!r.day?.check_out || undefined}>{clock12(r.day?.check_out) || '—'}</span>
      </span>
      <span className="cc-line" aria-hidden="true">
        {s0 != null && s1 != null && <i className="cc-shift" style={{ insetInlineStart: pos(s0), width: `calc(${pos(s1)} - ${pos(s0)})` } as CSSProperties} />}
        {tin != null && tout != null && <i className="cc-work" data-live={live != null || undefined} data-hue={barHue} style={{ insetInlineStart: pos(tin), width: `calc(${pos(Math.max(tout, tin + 5))} - ${pos(tin)})` } as CSSProperties} />}
        {tin != null && late > 0 && <i className="cc-lateseg" style={{ insetInlineStart: pos(tin - late), width: `calc(${pos(tin)} - ${pos(tin - late)})` } as CSSProperties} />}
        <i className="cc-now" style={{ insetInlineStart: pos(toMin(now) ?? 0) } as CSSProperties} />
      </span>
      <span className="cc-figs num">
        <b>{r.day ? hm(worked) : '—'}{live != null && <i className="cc-livedot" title="ما زال في العمل" />}</b>
        {late > 0 && <em data-k="late">+{hm(late)} تأخير</em>}
        {(r.day?.overtime_minutes ?? 0) > 0 && <em data-k="ot">+{hm(r.day!.overtime_minutes)} إضافي</em>}
      </span>
      <span className="cc-state">
        <span className="nx-chip nx-chip-dot" data-hue={st.hue}>{st.label}</span>
        {r.permission && <span className="nx-chip" data-hue="sky">إذن {r.permission}</span>}
        {forgot && <span className="nx-chip" data-hue="rose">لم يسجّل الخروج</span>}
        {r.day?.manually_edited && <span className="nx-chip" data-hue="slate">عُدّل يدوياً</span>}
      </span>
      {manage ? <button type="button" className="cc-act" onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label={`تعديل حضور ${r.user.name}`} title="تسجيل أو تعديل أو اعتماد"><Pencil size={16} /></button> : <span />}
    </div>
  )
}

function PeriodRow({ r, t, branch, onOpen }: { r: Row; t: Totals | undefined; branch: string; onOpen(): void }) {
  return (
    <div className="cc-row cc-prow" role="listitem" onClick={onOpen} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <span className="cc-who">
        <span className="cc-ava" data-hue={STATE[r.state].hue}><NxAvatar name={r.user.name} size={40} /><i /></span>
        <span className="cc-who-t"><b>{r.user.name}</b><small>{[r.user.job_title, r.user.department].filter(Boolean).join(' · ') || '—'}</small></span>
      </span>
      <span className="cc-branch">{branch}</span>
      <span className="cc-stat num"><b>{t?.days ?? 0}</b><small>يوم حضور</small></span>
      <span className="cc-stat num" data-warn={(t?.late_days ?? 0) > 0 || undefined}><b>{t?.late_days ?? 0}</b><small>{t?.late_minutes ? `تأخير · ${hm(t.late_minutes)}` : 'تأخير'}</small></span>
      <span className="cc-stat num"><b>{Math.round((t?.worked_minutes ?? 0) / 6) / 10}</b><small>ساعة عمل</small></span>
      <span className="cc-stat num"><b>{Math.round((t?.overtime_minutes ?? 0) / 6) / 10}</b><small>ساعة إضافي</small></span>
      <span className="cc-state">{(t?.pending ?? 0) > 0 ? <span className="nx-chip" data-hue="amber">{t!.pending} بانتظار الاعتماد</span> : <span className="nx-chip nx-chip-dot" data-hue={STATE[r.state].hue}>اليوم: {STATE[r.state].label}</span>}</span>
      <ChevronLeft size={17} className="cc-go" />
    </div>
  )
}
