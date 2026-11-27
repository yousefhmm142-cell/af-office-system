import { ArrowLeft, CalendarRange, CircleDollarSign, HandCoins, Plus, Settings2, Sparkles, Wallet } from 'lucide-react'
import { MonthField } from '../../ui/MonthField'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { can, scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, prevMonth, thisMonth, type Batch } from './lib'

/** Payroll at a glance: the months, their batches, and one big button to start the next one. */
export function PayrollHome() {
  const me = useUser()
  const { data, error, loading } = useLoad<{ batches: Batch[] }>('/payroll/batches')
  const [wizard, setWizard] = useState(false)
  const manage = can(me, 'payroll.manage')

  const [stage,setStage] = useState<Batch['status']>('approved')
  const batches = data?.batches ?? []
  const stages = [
    {key:'draft',label:'للمراجعة والاعتماد',icon:Sparkles,action:'مراجعة الكشف'},
    {key:'approved',label:'جاهزة للصرف',icon:CircleDollarSign,action:'فتح كشف الصرف'},
    {key:'paid',label:'تم صرفها',icon:Wallet,action:'عرض تفاصيل الصرف'},
  ] as const
  const selected = stages.find(item=>item.key===stage)!
  const visible = batches.filter(b=>b.status===stage)
  return (
    <>
      <PageHead title="صرف الرواتب" eyebrow="الدفعات الشهرية" actions={manage && <Button variant="primary" icon={<Plus size={18}/>} onClick={()=>setWizard(true)}>تجهيز دفعة رواتب</Button>} />
      <section className="card glass af-pad"><h2 className="af-h2"><HandCoins size={20}/>من أين يأتي مبلغ الدفعة؟</h2>
        <p>تُدخل شؤون الموظفين نوع الأجر وقيمته عند إنشاء الحساب أو من «تعديل القسم والراتب» في ملف الموظف. يبدأ كشف الصرف من هذا المبلغ.</p>
        <details><summary>طريقة الحساب حسب نوع الأجر</summary><p>للشهري والمقاولة تُطبّق نسبة الدفعة على المبلغ المتفق عليه. لليومية يُضرب أجر اليوم في الأيام المحتسبة. للأسبوعي يُقسّم أجر الأسبوع على أيام العمل الأسبوعية ثم يُضرب في الأيام المحتسبة. تُطبّق نسبة الدفعة على الناتج.</p></details>
        {can(me,'employees.manage') && can(me,'users.view') && <Link className="btn" to="/users">اختيار موظف لتحديد أجره</Link>}
      </section>
      <div className="pay-stages" role="group" aria-label="حالة الدفعات">{stages.map(({key,label,icon:Icon})=>{
        const group=batches.filter(b=>b.status===key)
        return <button type="button" key={key} className="card glass pay-stage" data-stage={key} aria-pressed={stage===key} onClick={()=>setStage(key)}>
          <Icon size={23}/><strong>{label}</strong><span>{group.length} دفعات</span><b>{fmt(group.reduce((sum,b)=>sum+b.total_net,0))} ₪</b>
        </button>
      })}</div>
      <section className="card glass af-pad pay-queue"><h2 className="af-h2">{selected.label}</h2>
        <p className="af-sub">{stage==='draft' ? 'راجع أسماء الموظفين والصافي ثم اعتمد الدفعة لتظهر في قائمة الصرف.' :
          stage==='approved' ? 'افتح كشف الصرف. بعد تحويل المبالغ للموظفين، اضغط «تسجيل صرف الدفعة» لتوثيق العملية.' :
          'الدفعات التي تم تسجيل صرفها، مع تاريخ الصرف وتفاصيل كل موظف.'}</p>
        <ErrorBanner text={error}/>
        {loading ? <Loading/> : visible.length ? visible.map(b=><div className="pay-queue-row" key={b.id}>
          <div><b>{b.title}</b><small className="af-sub">{monthLabel(b.month)} · {b.branch?.name ?? 'جميع الفروع'} · {b.percent}٪ من الشهر{b.paid_at && ' · صُرفت في '+new Date(b.paid_at).toLocaleDateString('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long' })}</small></div>
          <span><b>{fmt(b.total_net)} ₪</b><small className="af-sub">{b.employees_count} موظفاً</small></span>
          <Link className={'btn '+(stage==='approved'?'approve':'utility')} to={`/payroll/${b.id}`}>{selected.action}<ArrowLeft size={16}/></Link>
        </div>) : !error && <p className="pay-empty">{stage==='approved' ? 'لا توجد دفعات جاهزة للصرف. تظهر هنا الدفعة فور اعتمادها.' : stage==='draft' ? 'لا توجد مسودات بانتظار الاعتماد.' : 'لا توجد دفعات مسجّلة كمصروفة.'}</p>}
      </section>
      <nav className="af-toolbar pay-tools" aria-label="أدوات الرواتب">
        {manage && <><Link className="btn" to="/payroll/extras"><HandCoins size={17}/>خصومات ومكافآت وسلف</Link>
        <Link className="btn" to="/payroll/settings"><Settings2 size={17}/>إعدادات الإضافي</Link></>}
        <Link className="btn" to="/my-pay"><Wallet size={17}/>رواتبي الشخصية</Link>
      </nav>
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
  const advances = useLoad<{ advances: {id:number; user:{name:string}; branch_id:number; start_month:string; remaining:number; installment:number}[] }>(me.role?.key === 'hr' ? '/payroll/advances' : null)
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
