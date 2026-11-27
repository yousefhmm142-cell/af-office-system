import { AlarmClock, ArrowDown, ArrowUp, BadgeCheck, CalendarCheck, Check, ChevronLeft, CircleDollarSign, Fuel, Gauge, LayoutGrid, Palmtree, Sparkles, TrendingUp, UserX, Wrench, X, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../../api/client'
import { useConfirm } from '../../ui/Confirm'
import { NxAvatar, NxDonut, type Hue } from '../../ui/nx'
import { useToast } from '../../ui/Toast'
import { hm } from './CommandCenter'

type Leave = { id: number; kind: string; status: string; starts: string; ends: string; days: number; reason: string; from_time: string | null; to_time: string | null; user_id: number; name: string; branch: string | null }
type Batch = { id: number; title: string; month: string; branch: string | null; total_net: number; employees_count: number }
type Week = { arrivals: number; on_time: number | null; hours: number; overtime: number; late_minutes: number }
type BranchCard = {
  id: number; name: string; manager: string | null
  attendance: { expected: number; present: number; late: number; absent: number } | null
  generation: string | null; distribution: string | null; waiting: number
  fuel: { litres: number; days: number | null; as_of: string } | null
  tasks: { open: number; in_field: number; overdue: number } | null
}
export type CenterData = {
  now: string
  decisions: { leaves: Leave[]; batches: Batch[]; attendance: Array<{ branch_id: number; branch: string; count: number; since: string }> }
  alerts: { late_repeat: Array<{ user_id: number; name: string; branch: string; times: number; minutes: number }>; absent_streak: Array<{ user_id: number; name: string; branch: string }>; overdue_tasks: Array<{ id: number; number: number; type: string | null; status: string; branch_id: number; over: number; who: string }>; overdue_count: number }
  week: { this: Week; last: Week; branches: Array<{ branch: string; on_time: number }> }
  branches: BranchCard[]
  field: { busy: Array<{ task: number; type: string | null; branch: number; since: string | null; expected: number | null; people: Array<{ id: number; name: string }> }>; free: Array<{ id: number; name: string; branch: number }> }
  branch_names: Record<string, string>
}

const LEAVE_KIND: Record<string, string> = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', other: 'إجازة أخرى', permission: 'إذن بالساعات' }
const dm = (iso: string) => new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/* ───────────────────────── ④ what needs a decision ───────────────────────── */
export function Decisions({ data, reload }: { data: CenterData; reload(): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [gone, setGone] = useState<string[]>([])
  const d = data.decisions
  const total = d.leaves.length + d.batches.length + d.attendance.length

  async function act(key: string, run: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try { await run(); setGone((g) => [...g, key]); toast(ok); window.setTimeout(reload, 450) }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر الحفظ.', 'danger') } finally { setBusy(null) }
  }

  return (
    <section className="cx-card cx-decide">
      <header className="cx-h"><span className="cx-h-ico" data-hue="rose"><BadgeCheck size={18} /></span><h3>ينتظر قرارك</h3>{total > 0 && <span className="cx-count num">{total}</span>}</header>
      {total === 0 ? (
        <div className="cx-clear"><span><Sparkles size={22} /></span><b>لا شيء ينتظرك</b><small>كل الطلبات والدفعات محسومة.</small></div>
      ) : (
        <div className="cx-list">
          {d.leaves.map((l) => {
            const key = `l${l.id}`
            return (
              <article key={key} className="cx-item" data-gone={gone.includes(key) || undefined}>
                <NxAvatar name={l.name} size={38} />
                <div className="cx-item-t">
                  <b>{l.name} <span className="cx-tag" data-hue={l.status === 'escalated' ? 'violet' : 'sky'}>{l.status === 'escalated' ? 'محالة إليك' : LEAVE_KIND[l.kind] ?? l.kind}</span></b>
                  <small className="num">{l.kind === 'permission' ? `${dm(l.starts)} · ${l.from_time?.slice(0, 5)}–${l.to_time?.slice(0, 5)}` : `${dm(l.starts)} – ${dm(l.ends)} · ${l.days} ${l.days === 1 ? 'يوم' : 'أيام'}`}{l.branch ? ` · ${l.branch}` : ''}</small>
                  <p>{l.reason}</p>
                </div>
                <div className="cx-btns">
                  <button type="button" className="cx-yes" disabled={busy === key} onClick={() => void act(key, () => api(`/leaves/${l.id}`, { method: 'PATCH', body: { action: 'approved' } }), 'تمت الموافقة')} aria-label={`موافقة على طلب ${l.name}`}><Check size={17} /></button>
                  <button type="button" className="cx-no" disabled={busy === key} onClick={async () => { if (await confirm({ title: `رفض طلب ${l.name}؟`, confirmLabel: 'رفض', danger: true })) void act(key, () => api(`/leaves/${l.id}`, { method: 'PATCH', body: { action: 'rejected' } }), 'رُفض الطلب') }} aria-label={`رفض طلب ${l.name}`}><X size={17} /></button>
                </div>
              </article>
            )
          })}
          {d.batches.map((b) => {
            const key = `b${b.id}`
            return (
              <article key={key} className="cx-item" data-gone={gone.includes(key) || undefined}>
                <span className="cx-ico" data-hue="amber"><CircleDollarSign size={19} /></span>
                <div className="cx-item-t">
                  <b>دفعة رواتب <span className="cx-tag" data-hue="amber">{b.branch ?? 'جميع الفروع'}</span></b>
                  <small>{b.title} · <span className="num">{b.employees_count}</span> موظفاً</small>
                  <p className="cx-money num">{money.format(b.total_net)} <small>₪</small></p>
                </div>
                <div className="cx-btns">
                  <button type="button" className="cx-yes" disabled={busy === key} onClick={async () => { if (await confirm({ title: 'اعتماد الدفعة؟', message: `${b.title} · ${b.branch ?? 'جميع الفروع'} · ${money.format(b.total_net)} ₪`, confirmLabel: 'اعتماد' })) void act(key, () => api(`/payroll/batches/${b.id}/approve`, { method: 'POST' }), 'اعتُمدت الدفعة') }} aria-label="اعتماد الدفعة"><Check size={17} /></button>
                  <Link to={`/payroll/${b.id}`} className="cx-open" aria-label="مراجعة الدفعة"><ChevronLeft size={17} /></Link>
                </div>
              </article>
            )
          })}
          {d.attendance.map((a) => (
            <Link key={`a${a.branch_id}`} to="/attendance" className="cx-item cx-link">
              <span className="cx-ico" data-hue="sky"><CalendarCheck size={19} /></span>
              <div className="cx-item-t"><b>{a.count} يوم حضور بانتظار الاعتماد</b><small>فرع {a.branch} · منذ {dm(a.since)}</small></div>
              <ChevronLeft size={17} className="cx-go" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/* ───────────────────────── smart alerts ───────────────────────── */
export function Alerts({ data, onPerson }: { data: CenterData; onPerson(id: number): void }) {
  const a = data.alerts
  const total = a.late_repeat.length + a.absent_streak.length + a.overdue_count
  return (
    <section className="cx-card">
      <header className="cx-h"><span className="cx-h-ico" data-hue="amber"><AlarmClock size={18} /></span><h3>تنبيهات تستحق الانتباه</h3>{total > 0 && <span className="cx-count num" data-hue="amber">{total}</span>}</header>
      {total === 0 && <div className="cx-clear"><span><Sparkles size={22} /></span><b>كل شيء منتظم</b><small>لا تأخير متكرر ولا غياب ولا مهام متأخرة.</small></div>}
      {a.absent_streak.length > 0 && <Group title="غاب يومين متتاليين" icon={<UserX size={15} />} hue="rose">
        {a.absent_streak.map((p) => <button key={p.user_id} type="button" className="cx-person" onClick={() => onPerson(p.user_id)}><NxAvatar name={p.name} size={30} /><span><b>{p.name}</b><small>{p.branch}</small></span><ChevronLeft size={15} /></button>)}
      </Group>}
      {a.late_repeat.length > 0 && <Group title="تأخر 3 مرات أو أكثر هذا الشهر" icon={<AlarmClock size={15} />} hue="amber">
        {a.late_repeat.map((p) => (
          <button key={p.user_id} type="button" className="cx-person" onClick={() => onPerson(p.user_id)}>
            <NxAvatar name={p.name} size={30} /><span><b>{p.name}</b><small>{p.branch}</small></span>
            <span className="cx-times num"><b>{p.times}×</b><small>{hm(p.minutes)}</small></span>
          </button>
        ))}
      </Group>}
      {a.overdue_count > 0 && <Group title={`مهام ميدانية تجاوزت وقتها (${a.overdue_count})`} icon={<Wrench size={15} />} hue="violet">
        {a.overdue_tasks.map((t) => (
          <Link key={t.id} to="/tasks" className="cx-person">
            <span className="cx-tno num">#{t.number}</span>
            <span><b>{t.type ?? 'مهمة'}</b><small>{data.branch_names[t.branch_id] ?? ''}{t.who ? ` · ${t.who}` : ' · دون فني'}</small></span>
            <span className="cx-times num" data-hue="rose"><b>+{hm(t.over)}</b><small>تأخير</small></span>
          </Link>
        ))}
      </Group>}
    </section>
  )
}

function Group({ title, icon, hue, children }: { title: string; icon: ReactNode; hue: Hue; children: ReactNode }) {
  return <div className="cx-group"><span className="cx-group-h" data-hue={hue}>{icon}{title}</span><div className="cx-group-b">{children}</div></div>
}

/* ───────────────────────── the week in brief ───────────────────────── */
export function WeekBrief({ data }: { data: CenterData }) {
  const { this: w, last: l, branches } = data.week
  const delta = w.on_time != null && l.on_time != null ? w.on_time - l.on_time : null
  const cmp = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)
  return (
    <section className="cx-card cx-week">
      <header className="cx-h"><span className="cx-h-ico" data-hue="mint"><TrendingUp size={18} /></span><h3>أسبوعك باختصار</h3><small>آخر 7 أيام مقابل التي قبلها</small></header>
      <div className="cx-week-top">
        <NxDonut size={116} parts={[{ value: w.on_time ?? 0, hue: 'mint' }, { value: 100 - (w.on_time ?? 0), hue: 'amber' }]} center={w.on_time != null ? `${w.on_time}%` : '—'} caption="في الموعد" />
        <div className="cx-week-figs">
          {delta != null && <span className="cx-delta" data-up={delta >= 0 || undefined}>{delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}<b className="num">{Math.abs(delta)}</b> نقطة عن الأسبوع الماضي</span>}
          <Fig label="ساعات العمل" value={w.hours} unit="ساعة" change={cmp(w.hours, l.hours)} />
          <Fig label="العمل الإضافي" value={w.overtime} unit="ساعة" change={cmp(w.overtime, l.overtime)} />
          <Fig label="مجموع التأخير" value={hm(w.late_minutes)} change={cmp(w.late_minutes, l.late_minutes)} invert />
        </div>
      </div>
      {branches.length > 1 && <div className="cx-rank">
        <span className="cx-rank-h">الالتزام بالموعد حسب الفرع</span>
        {branches.map((b, i) => (
          <div key={b.branch} className="cx-rank-row" data-top={i === 0 || undefined} data-low={i === branches.length - 1 || undefined}>
            <span className="num">{i + 1}</span><b>{b.branch}</b>
            <span className="cx-rank-bar"><i style={{ width: `${b.on_time}%` }} /></span><em className="num">{b.on_time}%</em>
          </div>
        ))}
      </div>}
    </section>
  )
}
function Fig({ label, value, unit, change, invert }: { label: string; value: number | string; unit?: string; change: number | null; invert?: boolean }) {
  const good = change == null ? null : invert ? change <= 0 : change >= 0
  return <div className="cx-fig"><small>{label}</small><b className="num">{value}{unit && <em>{unit}</em>}</b>{change != null && change !== 0 && <span className="num" data-good={good || undefined}>{change > 0 ? '+' : ''}{change}%</span>}</div>
}

/* ───────────────────────── ⑤ the nine branches, live ───────────────────────── */
const SHEET: Record<string, { label: string; hue: Hue }> = {
  none: { label: 'لم يبدأ', hue: 'slate' }, draft: { label: 'قيد التعبئة', hue: 'amber' }, submitted: { label: 'أُرسل', hue: 'sky' }, approved: { label: 'معتمد', hue: 'mint' }, returned: { label: 'أُعيد', hue: 'rose' },
}
export function BranchMap({ data, selected, onPick }: { data: CenterData; selected: string; onPick(id: string): void }) {
  const afterNoon = new Date(data.now).getHours() >= 12
  return (
    <section className="cx-map">
      <header className="cx-map-h"><span className="cx-h-ico" data-hue="violet"><LayoutGrid size={18} /></span><h3>الفروع الآن</h3><small>اضغط على فرع لعرض موظفيه فقط</small></header>
      <div className="cx-map-grid">
        {data.branches.map((b) => {
          const att = b.attendance
          const pct = att && att.expected ? Math.round((att.present / att.expected) * 100) : null
          const sheet = (s: string | null) => s === null ? null : SHEET[s === 'none' && afterNoon ? 'none' : s] ?? SHEET.none!
          const gen = sheet(b.generation), dist = sheet(b.distribution)
          const lowFuel = b.fuel?.days != null && b.fuel.days < 2
          const on = selected === String(b.id)
          return (
            <button key={b.id} type="button" className="cx-branch" aria-pressed={on} onClick={() => onPick(on ? '' : String(b.id))}
              data-warn={(lowFuel || (b.tasks?.overdue ?? 0) > 0 || (afterNoon && b.generation === 'none')) || undefined}>
              <div className="cx-branch-h">
                <NxAvatar name={b.name} size={40} />
                <span><b>{b.name}</b><small>{b.manager ?? 'بدون مدير'}</small></span>
                {pct != null && <NxDonut size={52} parts={[{ value: att!.present - att!.late, hue: 'mint' }, { value: att!.late, hue: 'amber' }, { value: Math.max(0, att!.expected - att!.present), hue: 'slate' }]} center={`${pct}%`} />}
              </div>
              {att && <div className="cx-branch-att num"><span><b>{att.present}</b>/{att.expected} حاضر</span>{att.late > 0 && <span data-hue="amber">{att.late} متأخر</span>}{att.absent > 0 && <span data-hue="rose">{att.absent} غائب</span>}</div>}
              <div className="cx-branch-ops">
                {gen && <span className="cx-op" data-hue={gen.hue} title="تقرير التوليد اليوم"><Zap size={13} /> التوليد: {gen.label}</span>}
                {dist && <span className="cx-op" data-hue={dist.hue} title="كشف التوزيع اليوم"><LayoutGrid size={13} /> التوزيع: {dist.label}</span>}
                {b.fuel && <span className="cx-op" data-hue={lowFuel ? 'rose' : 'slate'} title={`حسب تقرير ${dm(b.fuel.as_of)}`}><Fuel size={13} /> <span className="num">{money.format(b.fuel.litres)}</span> لتر{b.fuel.days != null ? <> · <span className="num">{b.fuel.days}</span> يوم</> : null}</span>}
                {b.tasks && <span className="cx-op" data-hue={b.tasks.overdue ? 'rose' : 'slate'}><Wrench size={13} /> <span className="num">{b.tasks.open}</span> مفتوحة{b.tasks.in_field ? <> · <span className="num">{b.tasks.in_field}</span> بالميدان</> : null}{b.tasks.overdue ? <> · <span className="num">{b.tasks.overdue}</span> متأخرة</> : null}</span>}
                {b.waiting > 0 && <span className="cx-op" data-hue="sky"><Gauge size={13} /> <span className="num">{b.waiting}</span> تقرير بانتظار الاعتماد</span>}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ───────────────────────── technicians right now ───────────────────────── */
export function FieldNow({ data, onPerson }: { data: CenterData; onPerson(id: number): void }) {
  const { busy, free } = data.field
  if (busy.length === 0 && free.length === 0) return null
  const nowMs = new Date(data.now).getTime()
  return (
    <section className="cx-card">
      <header className="cx-h"><span className="cx-h-ico" data-hue="violet"><Wrench size={18} /></span><h3>الفنيون الآن</h3><small><span className="num">{busy.length}</span> بالميدان · <span className="num">{free.length}</span> متاح</small></header>
      <div className="cx-list">
        {busy.slice(0, 8).map((t) => {
          const mins = t.since ? Math.round((nowMs - new Date(t.since).getTime()) / 60000) : 0
          const pct = t.expected ? Math.min(100, Math.round((mins / t.expected) * 100)) : null
          return (
            <div key={t.task} className="cx-field">
              <div className="cx-faces">{t.people.slice(0, 3).map((p) => <button key={p.id} type="button" onClick={() => onPerson(p.id)} title={p.name}><NxAvatar name={p.name} size={32} /></button>)}</div>
              <div className="cx-item-t"><b>{t.people.map((p) => p.name.split(' ')[0]).join('، ') || '—'}</b><small><span className="num">#{t.task}</span> · {t.type ?? 'مهمة'} · {data.branch_names[t.branch] ?? ''}</small>
                {pct != null && <span className="cx-prog" data-over={pct >= 100 || undefined}><i style={{ width: `${pct}%` }} /></span>}</div>
              <span className="cx-times num"><b>{hm(mins)}</b>{t.expected ? <small>من {hm(t.expected)}</small> : null}</span>
            </div>
          )
        })}
      </div>
      {free.length > 0 && <div className="cx-free"><span><Palmtree size={14} /> متاحون للإسناد</span>
        <div>{free.slice(0, 12).map((p) => <button key={p.id} type="button" className="cx-free-p" onClick={() => onPerson(p.id)}><NxAvatar name={p.name} size={24} />{p.name.split(' ')[0]}<small>{data.branch_names[p.branch] ?? ''}</small></button>)}</div>
      </div>}
    </section>
  )
}
