import { ArrowLeft, CalendarRange, CircleDollarSign, HandCoins, Plus, Settings2, Sparkles, Users, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { can, scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, prevMonth, STATUS, thisMonth, type Batch } from './lib'

/** Payroll at a glance: the months, their batches, and one big button to start the next one. */
export function PayrollHome() {
  const me = useUser()
  const { data, error, loading } = useLoad<{ batches: Batch[] }>('/payroll/batches')
  const [wizard, setWizard] = useState(false)
  const manage = can(me, 'payroll.manage')

  const months = useMemo(() => {
    // One card per month and branch (a company-wide batch has its own card).
    const map = new Map<string, Batch[]>()
    for (const b of data?.batches ?? []) {
      const key = `${b.month}|${b.branch?.id ?? 'all'}`
      map.set(key, [...(map.get(key) ?? []), b])
    }
    return [...map.entries()].map(([key, list]) => [key.split('|')[0]!, list, key] as const)
  }, [data])
  const pending = (data?.batches ?? []).filter((b) => b.status === 'draft')
  const toPay = (data?.batches ?? []).filter((b) => b.status === 'approved')

  return (
    <>
      <PageHead title="الرواتب" eyebrow="دفعات الرواتب، والخصومات، والسلف"
        actions={manage && <Button variant="primary" size="lg" icon={<Plus size={20} />} onClick={() => setWizard(true)}>دفعة رواتب جديدة</Button>} />

      {manage && (
        <nav className="af-tiles" aria-label="أقسام الرواتب">
          <Link to="/payroll/extras" className="af-tile glass"><span className="af-tile-ico"><HandCoins size={22} /></span><b>الخصومات والمكافآت والسلف</b><small>أضف بنداً لموظف في ثوانٍ</small></Link>
          <Link to="/payroll/settings" className="af-tile glass"><span className="af-tile-ico"><Settings2 size={22} /></span><b>قواعد الحساب</b><small>التأخير، والغياب، والوقت الإضافي</small></Link>
          <Link to="/my-pay" className="af-tile glass"><span className="af-tile-ico"><Wallet size={22} /></span><b>رواتبي</b><small>دفعاتك أنت وتفاصيلها</small></Link>
        </nav>
      )}

      {(pending.length > 0 || toPay.length > 0) && (
        <div className="af-attention">
          {pending.map((b) => (
            <Link key={b.id} to={`/payroll/${b.id}`} className="af-attn warn"><Sparkles size={18} /><span><b>{b.title}</b> · {b.branch?.name ?? 'جميع الفروع'} بانتظار المراجعة والاعتماد</span><ArrowLeft size={16} /></Link>
          ))}
          {toPay.map((b) => (
            <Link key={b.id} to={`/payroll/${b.id}`} className="af-attn info"><CircleDollarSign size={18} /><span><b>{b.title}</b> · {b.branch?.name ?? 'جميع الفروع'} معتمدة وجاهزة للصرف</span><ArrowLeft size={16} /></Link>
          ))}
        </div>
      )}

      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : months.length === 0 ? (
        <section className="card glass af-empty-hero">
          <span className="af-empty-ico"><Wallet size={34} /></span>
          <h2>لا توجد دفعات بعد</h2>
          <p className="eyebrow">ابدأ بإنشاء أول دفعة رواتب، وسيحسب النظام كل شيء تلقائياً.</p>
          {manage && <Button variant="primary" size="lg" icon={<Plus size={20} />} onClick={() => setWizard(true)}>دفعة رواتب جديدة</Button>}
        </section>
      ) : (
        <div className="af-months">
          {months.map(([month, batches, key]) => {
            const done = batches.reduce((s, b) => s + b.percent, 0)
            const total = batches.reduce((s, b) => s + b.total_net, 0)
            return (
              <section key={key} className="card glass af-month-card">
                <header className="af-month-head">
                  <div><p className="eyebrow">{batches[0]?.branch?.name ?? 'جميع الفروع'}</p><h2>{monthLabel(month)}</h2></div>
                  <div className="af-month-total"><small>المجموع</small><b className="num">{fmt(total)}</b><small>شيكل</small></div>
                </header>
                <div className="af-progress" role="img" aria-label={`تم تخطيط ${done}% من الشهر`}>
                  {batches.map((b) => <span key={b.id} data-status={b.status} style={{ width: `${b.percent}%` }} />)}
                </div>
                <div className="rows">
                  {batches.map((b) => (
                    <Link key={b.id} to={`/payroll/${b.id}`} className="row af-batch-row">
                      <span className="af-batch-pct num">{b.percent}%</span>
                      <span className="row-label">{b.title}<small className="af-sub"><Users size={13} /> {b.employees_count} موظفاً{b.is_final ? ' · تشمل حساب الحضور' : ''}</small></span>
                      <b className="num">{fmt(b.total_net)}</b>
                      <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {wizard && <NewBatchWizard onClose={() => setWizard(false)} />}
    </>
  )
}

/** Three quick choices: which month, which branch, what share. The numbers are worked out after. */
function NewBatchWizard({ onClose }: { onClose(): void }) {
  const me = useUser()
  const toast = useToast()
  const navigate = useNavigate()
  const all = scopeOf(me, 'payroll.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [month, setMonth] = useState(thisMonth)
  const [branchId, setBranchId] = useState<string>(all ? '' : String(me.branch?.id ?? ''))
  const [plan, setPlan] = useState<{ used: number; left: number; employees: number } | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPlan(null)
    setPercent(null)
    api<{ used: number; left: number; employees: number }>(`/payroll/plan?month=${month}${branchId ? `&branch_id=${branchId}` : ''}`)
      .then((p) => { setPlan(p); setPercent(p.left >= 50 && p.used === 0 ? 50 : p.left) })
      .catch(() => setPlan(null))
  }, [month, branchId])

  const chosen = percent ?? (Number(custom) || 0)
  const final = plan ? Math.abs(plan.used + chosen - 100) < 0.01 : false
  const options = plan ? [...new Set([50, 100, plan.left].filter((n) => n > 0 && n <= plan.left))].sort((a, b) => a - b) : []
  const months = [thisMonth(), prevMonth(thisMonth())]

  async function create() {
    setBusy(true); setError(null)
    try {
      const res = await api<{ batch: Batch }>('/payroll/batches', { method: 'POST', body: { month, percent: chosen, branch_id: branchId ? Number(branchId) : null } })
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
            <input className="input num af-month-input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="شهر آخر" />
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
          {!plan ? <Loading /> : plan.left <= 0 ? (
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
                {final ? ' هذه الدفعة تُكمل الشهر، لذلك تُحسب فيها خصومات التأخير والغياب والوقت الإضافي.' : ' تُحسب خصومات الحضور والوقت الإضافي في الدفعة التي تُكمل الشهر.'}
              </p>
            </>
          )}
        </section>
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}
