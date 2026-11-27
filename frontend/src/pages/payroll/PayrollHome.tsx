import { ArrowLeft, BadgeCheck, CalendarRange, Check, ChevronLeft, ChevronRight, CircleDollarSign, HandCoins, Info, Plus, Settings2, Sparkles, Wallet } from 'lucide-react'
import { NxAvatar, NxCard, NxEmpty, NxStat, type Hue } from '../../ui/nx'
import { MonthField } from '../../ui/MonthField'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { can, scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, prevMonth, STATUS, thisMonth, type Batch } from './lib'

const STATUS_HUE: Record<string, Hue> = { draft: 'amber', approved: 'sky', paid: 'mint' }

/** Payroll by month: where the month stands (prepared, approved, paid) and the one thing to do next. */
export function PayrollHome() {
  const me = useUser()
  const { data, error, loading } = useLoad<{ batches: Batch[] }>('/payroll/batches')
  const [wizard, setWizard] = useState(false)
  const [month, setMonth] = useState(thisMonth)
  // Open on the month that still has work in it (a batch to approve or to pay), else this month.
  const [picked, setPicked] = useState(false)
  useEffect(() => {
    if (picked || !data) return
    setPicked(true)
    const open = data.batches.filter((b) => b.status !== 'paid').map((b) => b.month).sort()
    if (open.length && !data.batches.some((b) => b.month === thisMonth())) setMonth(open[open.length - 1]!)
  }, [data, picked])
  const manage = can(me, 'payroll.manage')
  const approver = can(me, 'payroll.approve')
  const batches = (data?.batches ?? []).filter((b) => b.month === month)
  const drafts = batches.filter((b) => b.status === 'draft')
  const approved = batches.filter((b) => b.status === 'approved')
  const paid = batches.filter((b) => b.status === 'paid')
  const planned = Math.min(100, batches.reduce((n, b) => n + b.percent, 0))
  const total = batches.reduce((n, b) => n + b.total_net, 0)
  // Waiting elsewhere: months other than this one with something still to do.
  const elsewhere = (data?.batches ?? []).filter((b) => b.month !== month && b.status !== 'paid')

  const next: { tone: 'warn' | 'info' | 'ok'; title: string; text: string; action?: { label: string; to?: string; onClick?(): void } } =
    drafts.length ? (approver
      ? { tone: 'warn', title: 'دفعة بانتظار اعتمادك', text: 'راجع أسماء الموظفين والصافي، ثم اعتمد الدفعة لتصبح جاهزة للصرف.', action: { label: 'مراجعة واعتماد', to: `/payroll/${drafts[0]!.id}` } }
      : { tone: 'info', title: 'الدفعة بانتظار الاعتماد', text: 'جُهّزت الدفعة، وتنتظر اعتماد صاحب الصلاحية. يمكنك مراجعتها أو إعادة حسابها.', action: { label: 'فتح الدفعة', to: `/payroll/${drafts[0]!.id}` } })
    : approved.length ? (manage
      ? { tone: 'info', title: 'دفعة معتمدة جاهزة للصرف', text: 'حوّل المبالغ للموظفين، ثم سجّل الصرف لتوثيقه.', action: { label: 'فتح كشف الصرف', to: `/payroll/${approved[0]!.id}` } }
      : { tone: 'info', title: 'الدفعة معتمدة', text: 'تنتظر تحويل المبالغ وتسجيل الصرف.', action: { label: 'عرض الدفعة', to: `/payroll/${approved[0]!.id}` } })
    : planned >= 100 ? { tone: 'ok', title: 'اكتمل هذا الشهر', text: 'صُرفت رواتب الشهر كاملة.' }
    : batches.length ? { tone: 'info', title: `صُرف ${planned}% من الشهر`, text: 'جهّز دفعة للمتبقي عندما يحين موعدها.', action: manage ? { label: 'تجهيز دفعة المتبقي', onClick: () => setWizard(true) } : undefined }
    : { tone: 'info', title: 'لم تُجهَّز رواتب هذا الشهر بعد', text: manage ? 'ابدأ بدفعة: اختر الفرع والنسبة، ويحسب النظام كل شيء.' : 'تظهر هنا الدفعات عند تجهيزها.', action: manage ? { label: 'تجهيز دفعة رواتب', onClick: () => setWizard(true) } : undefined }

  const steps = [
    { key: 'draft', label: 'التجهيز', icon: Sparkles, list: drafts, hint: 'تُحسب وتنتظر الاعتماد' },
    { key: 'approved', label: 'الاعتماد', icon: BadgeCheck, list: approved, hint: 'جاهزة للصرف' },
    { key: 'paid', label: 'الصرف', icon: Wallet, list: paid, hint: 'سُجّل صرفها' },
  ] as const
  // The step the month is at now: the first one that still holds a batch, else done.
  const current = drafts.length ? 0 : approved.length ? 1 : batches.length ? 2 : -1
  const sum = (l: typeof batches) => l.reduce((n, b) => n + b.total_net, 0)
  const nextMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number) as [number, number]; const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

  return (
    <div className="nx nxp">
      <section className="nxp-hero">
        <div className="nxp-hero-top">
          <div className="nxp-month">
            <span className="nxp-eyebrow">رواتب شهر</span>
            <div className="nxp-month-nav">
              <button type="button" className="nxp-arrow" aria-label="الشهر السابق" onClick={() => setMonth(prevMonth(month))}><ChevronRight size={20} /></button>
              <h1>{monthLabel(month)}</h1>
              <button type="button" className="nxp-arrow" aria-label="الشهر التالي" onClick={() => setMonth(nextMonth(month))} disabled={month >= thisMonth()}><ChevronLeft size={20} /></button>
            </div>
            <MonthField className="nxp-month-pick" value={month} onChange={setMonth} aria-label="اختيار شهر" />
          </div>
          <div className="nxp-total">
            <span className="nxp-eyebrow">صافي الدفعات</span>
            <strong className="num">{fmt(total)} <small>₪</small></strong>
            <div className="nxp-planned"><div className="nxp-planned-bar"><i style={{ width: `${planned}%` }} /></div><span className="num">{planned}% من الشهر</span></div>
          </div>
        </div>
        <ol className="nxp-steps">
          {steps.map(({ key, label, icon: Icon, list }, i) => (
            <li key={key} data-state={current === -1 ? 'todo' : i < current || (i === current && current === 2 && planned >= 100 && !drafts.length && !approved.length) ? 'done' : i === current ? 'now' : list.length ? 'done' : 'todo'}>
              <span className="nxp-step-dot">{list.length && i !== current ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="nxp-step-t"><b>{label}</b><small className="num">{list.length ? `${list.length} ${list.length === 1 ? 'دفعة' : 'دفعات'}` : '—'}</small></span>
            </li>
          ))}
        </ol>
      </section>

      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : <>
        <section className="nxp-next" data-tone={next.tone}>
          <span className="nx-ico" data-hue={next.tone === 'warn' ? 'amber' : next.tone === 'ok' ? 'mint' : 'sky'}>{next.tone === 'ok' ? <Check size={20} /> : next.tone === 'warn' ? <BadgeCheck size={20} /> : <Sparkles size={20} />}</span>
          <div className="nxp-next-t"><small>الخطوة التالية</small><h2>{next.title}</h2><p>{next.text}</p></div>
          {next.action && (next.action.to
            ? <Link className="btn primary lg" to={next.action.to}>{next.action.label}<ArrowLeft size={18} /></Link>
            : <Button variant="primary" size="lg" icon={<Plus size={18} />} onClick={next.action.onClick}>{next.action.label}</Button>)}
        </section>

        <div className="nx-stats nx-stats-3">
          <NxStat icon={<Sparkles size={19} />} hue="amber" label="بانتظار الاعتماد" value={fmt(sum(drafts))} unit="₪" sub={drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'دفعة' : 'دفعات'}` : 'لا شيء'} />
          <NxStat icon={<BadgeCheck size={19} />} hue="sky" label="جاهزة للصرف" value={fmt(sum(approved))} unit="₪" sub={approved.length ? `${approved.length} ${approved.length === 1 ? 'دفعة' : 'دفعات'}` : 'لا شيء'} />
          <NxStat icon={<Wallet size={19} />} hue="mint" label="صُرفت" value={fmt(sum(paid))} unit="₪" sub={paid.length ? `${paid.length} ${paid.length === 1 ? 'دفعة' : 'دفعات'}` : 'لا شيء'} />
        </div>

        <NxCard title={`دفعات ${monthLabel(month)}`} icon={<CalendarRange size={17} />}
          action={manage && <Button icon={<Plus size={16} />} onClick={() => setWizard(true)}>دفعة جديدة</Button>}>
          {batches.length > 0 ? (
            <div className="nxp-rows">
              {batches.map((b) => (
                <Link key={b.id} to={`/payroll/${b.id}`} className="nxp-row">
                  <NxAvatar name={b.branch?.name ?? 'جميع الفروع'} size={44} />
                  <span className="nxp-row-main"><b>{b.branch?.name ? `فرع ${b.branch.name}` : 'جميع الفروع'}</b><small>{b.title} · <span className="num">{b.employees_count}</span> موظفاً{b.is_final ? ' · تُكمل الشهر' : ''}</small></span>
                  <span className="nxp-pct"><span className="nx-progress" data-hue={STATUS_HUE[b.status]}><i style={{ width: `${b.percent}%` }} /></span><small className="num">{b.percent}%</small></span>
                  <b className="num nxp-net">{fmt(b.total_net)} <small>₪</small></b>
                  <span className="nx-chip nx-chip-dot" data-hue={STATUS_HUE[b.status]}>{STATUS[b.status].label}</span>
                  <ArrowLeft size={17} className="nxp-go" />
                </Link>
              ))}
            </div>
          ) : <NxEmpty icon={<Wallet size={26} />} title="لا توجد دفعات لهذا الشهر" text={manage ? 'جهّز دفعة: تختار الفرع والنسبة، ويحسب النظام الباقي.' : undefined} />}
        </NxCard>

        {elsewhere.length > 0 && (
          <NxCard title="دفعات أشهر أخرى لم تُصرف بعد" icon={<CalendarRange size={17} />}>
            <div className="nxp-rows">
              {elsewhere.slice(0, 4).map((b) => (
                <Link key={b.id} to={`/payroll/${b.id}`} className="nxp-row nxp-row-sm">
                  <span className="nxp-row-main"><b>{b.title}</b><small>{b.branch?.name ?? 'جميع الفروع'}</small></span>
                  <b className="num nxp-net">{fmt(b.total_net)} <small>₪</small></b>
                  <span className="nx-chip nx-chip-dot" data-hue={STATUS_HUE[b.status]}>{STATUS[b.status].label}</span>
                  <ArrowLeft size={17} className="nxp-go" />
                </Link>
              ))}
            </div>
          </NxCard>
        )}
      </>}

      <nav className="nxp-tools" aria-label="أدوات الرواتب">
        {manage && <Link to="/payroll/extras" className="nxp-tool"><span className="nx-ico" data-hue="violet"><HandCoins size={20} /></span><span><b>الخصومات والمكافآت</b><small>بند لموظف في شهر محدد</small></span><ArrowLeft size={16} /></Link>}
        {manage && <Link to="/payroll/extras?tab=advances" className="nxp-tool"><span className="nx-ico" data-hue="amber"><CircleDollarSign size={20} /></span><span><b>السلف</b><small>مبلغ يُسدَّد على أقساط</small></span><ArrowLeft size={16} /></Link>}
        {manage && <Link to="/payroll/settings" className="nxp-tool"><span className="nx-ico" data-hue="sky"><Settings2 size={20} /></span><span><b>قواعد الحساب</b><small>الوقت الإضافي والخصومات</small></span><ArrowLeft size={16} /></Link>}
        <Link to="/my-pay" className="nxp-tool"><span className="nx-ico" data-hue="mint"><Wallet size={20} /></span><span><b>رواتبي</b><small>دفعاتك أنت</small></span><ArrowLeft size={16} /></Link>
      </nav>

      <details className="nxp-help">
        <summary><Info size={18} /> كيف يُحسب الراتب؟</summary>
        <ul>
          <li>يبدأ الحساب من نوع الأجر وقيمته في ملف الموظف (شهري، يومي، أسبوعي، مقاولة).</li>
          <li>الشهري والمقاولة: نسبة الدفعة من المبلغ المتفق عليه. اليومي: أجر اليوم × أيام الحضور. الأسبوعي: أجر الأسبوع ÷ أيام العمل × أيام الحضور.</li>
          <li>الوقت الإضافي يُحسب في الدفعة التي تُكمل الشهر، حسب «قواعد الحساب».</li>
          <li>الخصومات والمكافآت تدخل في أول دفعة للشهر، وقسط السلفة في الدفعة التي يُختار فيها.</li>
        </ul>
      </details>

      {wizard && <NewBatchWizard initialMonth={month} onClose={() => setWizard(false)} />}
    </div>
  )
}

/** Three quick choices: which month, which branch, what share. The numbers are worked out after. */
function NewBatchWizard({ initialMonth, onClose }: { initialMonth: string; onClose(): void }) {
  const me = useUser()
  const toast = useToast()
  const navigate = useNavigate()
  const all = scopeOf(me, 'payroll.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [month, setMonth] = useState(initialMonth)
  const [branchId, setBranchId] = useState<string>(all ? '' : String(me.branch?.id ?? ''))
  const [plan, setPlan] = useState<{ used: number; left: number; employees: number } | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const advances = useLoad<{ advances: {id:number; user:{name:string}; branch_id:number; start_month:string; remaining:number; installment:number}[] }>(can(me, 'payroll.deductions') ? '/payroll/advances' : null)
  const [advanceIds, setAdvanceIds] = useState<number[]>([])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null)
    setAdvanceIds([])
    setPlan(null)
    setPercent(null)
    api<{ used: number; left: number; employees: number }>(`/payroll/plan?month=${month}${branchId ? `&branch_id=${branchId}` : ''}`)
      .then((p) => { if (!active) return; setPlan(p); setPercent(p.left >= 50 && p.used === 0 ? 50 : p.left) })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : 'تعذّر تحميل خطة الدفعة.') })
    return () => { active = false }
  }, [month, branchId])

  const chosen = percent ?? (Number(custom) || 0)
  const final = plan ? Math.abs(plan.used + chosen - 100) < 0.01 : false
  const options = plan ? [...new Set([50, 100, plan.left].filter((n) => n > 0 && n <= plan.left))].sort((a, b) => a - b) : []
  const months = [thisMonth(), prevMonth(thisMonth())]

  async function create() {
    setBusy(true); setError(null)
    try {
      const res = await api<{ batch: Batch }>('/payroll/batches', { method: 'POST', body: { month, percent: chosen, advance_ids: advanceIds, branch_id: branchId ? Number(branchId) : null } })
      toast('أُنشئت الدفعة وحُسبت')
      navigate(`/payroll/${res.batch.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.')
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="دفعة رواتب جديدة" subtitle="ثلاث خطوات، والحساب تلقائي" icon={<CalendarRange size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" size="lg" busy={busy} disabled={!plan || chosen <= 0 || chosen > (plan?.left ?? 0)} onClick={() => void create()}>إنشاء وحساب</Button></>}>
      <div className="af-steps">
        <section className="af-step">
          <h3><span className="af-step-n">1</span> أي شهر؟</h3>
          <div className="chips">
            {months.map((m) => <button key={m} type="button" className="chip" aria-pressed={month === m} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
            <MonthField className="af-month-input" value={month} onChange={setMonth} aria-label="شهر آخر" />
          </div>
        </section>
        {all && (
          <section className="af-step">
            <h3><span className="af-step-n">2</span> لأي فرع؟</h3>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={branchId === ''} onClick={() => setBranchId('')}>جميع الفروع</button>
              {branches.data?.branches.map((b) => <button key={b.id} type="button" className="chip" aria-pressed={branchId === String(b.id)} onClick={() => setBranchId(String(b.id))}>{b.name}</button>)}
            </div>
          </section>
        )}
        <section className="af-step">
          <h3><span className="af-step-n">{all ? 3 : 2}</span> كم من راتب الشهر؟</h3>
          {!plan ? (error ? null : <Loading />) : plan.left <= 0 ? (
            <p className="banner warn"><span>صُرف هذا الشهر كاملاً (100%). اختر شهراً آخر.</span></p>
          ) : (
            <>
              <div className="af-pcts">
                {options.map((n) => (
                  <button key={n} type="button" className="af-pct" aria-pressed={percent === n} onClick={() => { setPercent(n); setCustom('') }}>
                    <b className="num">{n}%</b><small>{n === plan.left && plan.used > 0 ? 'المتبقي من الشهر' : n === 100 ? 'الشهر كاملاً' : 'نصف الشهر'}</small>
                  </button>
                ))}
                <label className="af-pct af-pct-custom" data-on={percent === null && custom ? '' : undefined}>
                  <input className="input num" inputMode="decimal" placeholder="نسبة أخرى" value={custom} onChange={(e) => { setCustom(e.target.value.replace(/[^0-9.]/g, '')); setPercent(null) }} />
                </label>
              </div>
              <p className="af-explain">
                سيُصرف <b className="num">{chosen || 0}%</b> من راتب {monthLabel(month)} لـ <b className="num">{plan.employees}</b> موظفاً.
                {plan.used > 0 && <> سبقته دفعات بنسبة <b className="num">{plan.used}%</b>.</>}
                {final ? ' هذه الدفعة تُكمل الشهر، لذلك تُحسب فيها ساعات العمل الإضافي.' : ' تُحسب ساعات العمل الإضافي في الدفعة التي تُكمل الشهر.'}
              </p>
            </>
          )}
        </section>
        {can(me, 'payroll.deductions') && <fieldset className="form-grid"><legend>أقساط السلف المطلوب خصمها من هذه الدفعة</legend>
          <p>حدّد السلفة لاعتماد خصم قسطها.</p>{advances.data?.advances.filter(a => a.remaining > 0 && a.start_month <= month && (!branchId || a.branch_id === Number(branchId))).map(a =>
          <label key={a.id}><input type="checkbox" checked={advanceIds.includes(a.id)} onChange={e => setAdvanceIds(e.target.checked ? [...advanceIds,a.id] : advanceIds.filter(id => id !== a.id))} /> {a.user?.name} · {Math.min(a.installment,a.remaining)} شيكل</label>)}</fieldset>}
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}
