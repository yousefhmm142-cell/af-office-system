import { HandCoins, Minus, Plus, Trash2 } from 'lucide-react'
import { MonthField } from '../../ui/MonthField'
import { useMemo, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../api/client'
import { can, useUser } from '../../app/auth'
import type { User } from '../../api/types'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { PersonPicker, type Person } from '../../ui/PersonPicker'
import { Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, thisMonth, type Adjustment, type Advance } from './lib'

/** Deductions, bonuses and advances: one simple form on top, the list under it. */
export function Extras() {
  const [tab, setTab] = useState<'adj' | 'adv'>(() => new URLSearchParams(window.location.search).get('tab') === 'advances' ? 'adv' : 'adj')
  const users = useLoad<{ users: User[] }>('/users?status=active')
  const people = useMemo<Person[]>(() => (users.data?.users ?? []).map((u) => ({ id: u.id, name: u.name, sub: [u.job_title ?? u.role?.name, u.branch?.name].filter(Boolean).join(' · ') })), [users.data])
  return (
    <>
      <PageHead title="الخصومات والمكافآت والسلف" eyebrow="تدخل في أول دفعة رواتب للشهر المحدد" />
      <div className="segmented af-tabs" role="radiogroup" aria-label="النوع">
        <button type="button" role="radio" aria-checked={tab === 'adj'} onClick={() => setTab('adj')}>الخصومات والمكافآت</button>
        <button type="button" role="radio" aria-checked={tab === 'adv'} onClick={() => setTab('adv')}>السلف</button>
      </div>
      {tab === 'adj' ? <Adjustments people={people} /> : <Advances people={people} />}
    </>
  )
}

function Adjustments({ people }: { people: Person[] }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [month, setMonth] = useState(thisMonth)
  const { data, loading, reload } = useLoad<{ adjustments: Adjustment[] }>(`/payroll/adjustments?month=${month}`)
  const [person, setPerson] = useState<Person | null>(null)
  const hr = can(useUser(), 'payroll.deductions')
  const [type, setType] = useState<'deduction' | 'bonus'>(hr ? 'deduction' : 'bonus')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!person) return setFields({ user_id: 'اختر الموظف.' })
    setBusy(true); setFields({})
    try {
      await api('/payroll/adjustments', { method: 'POST', body: { user_id: person.id, type, month, amount: Number(amount), reason } })
      toast(type === 'bonus' ? 'أُضيفت المكافأة' : 'أُضيف الخصم')
      setAmount(''); setReason(''); setPerson(null)
      void reload()
    } catch (err) {
      if (err instanceof ApiError) setFields(Object.keys(err.fields).length ? err.fields : { reason: err.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="af-grid2 af-extras">
      <form className="card glass af-pad form-grid" onSubmit={add}>
        <div className="segmented af-type" role="radiogroup" aria-label="النوع">
          {hr && <button type="button" role="radio" aria-checked={type === 'deduction'} onClick={() => setType('deduction')}><Minus size={16} /> خصم</button>}
          <button type="button" role="radio" aria-checked={type === 'bonus'} onClick={() => setType('bonus')}><Plus size={16} /> مكافأة</button>
        </div>
        <Field label="الموظف" error={fields.user_id}>{() => <PersonPicker people={people} value={person} onChange={setPerson} label="الموظف" />}</Field>
        <div className="af-row2">
          <Field label="المبلغ (شيكل)" error={fields.amount}>{(id) => <input id={id} className="input num af-big-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />}</Field>
          <Field label="عن شهر" error={fields.month}>{(id) => <MonthField id={id} value={month} onChange={setMonth} />}</Field>
        </div>
        <Field label="السبب" error={fields.reason}>{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'bonus' ? 'مثال: مكافأة إنجاز' : 'مثال: تلف معدّات'} />}</Field>
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={!amount || !reason.trim()}>{type === 'bonus' ? 'إضافة المكافأة' : 'إضافة الخصم'}</Button>
      </form>
      <section className="card glass af-pad">
        <h2 className="af-h2">بنود {monthLabel(month)}</h2>
        {loading && !data ? <Loading /> : (
          <div className="rows">
            {data?.adjustments.map((a) => (
              <div key={a.id} className="row">
                <span className={`af-sign ${a.type === 'bonus' ? 'plus' : 'minus'}`}>{a.type === 'bonus' ? <Plus size={16} /> : <Minus size={16} />}</span>
                <span className="row-label">{a.user?.name}<small className="af-sub">{a.reason}</small></span>
                <b className={`num ${a.type === 'bonus' ? 'plus' : 'minus'}`}>{fmt(a.amount)}</b>
                {a.batch ? <Pill tone={a.batch.status === 'draft' ? 'warn' : 'ok'} dot={false}>{a.batch.status === 'draft' ? 'في مسودة' : 'صُرف'}</Pill> : <Pill tone="neutral" dot={false}>ينتظر دفعة</Pill>}
                {(!a.batch || a.batch.status === 'draft') && (
                  <button type="button" className="icon-btn" aria-label={`حذف بند ${a.user?.name}`} onClick={async () => {
                    if (!(await confirm({ title: 'حذف البند؟', danger: true, confirmLabel: 'حذف' }))) return
                    try { await api(`/payroll/adjustments/${a.id}`, { method: 'DELETE' }); void reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحذف', 'danger') }
                  }}><Trash2 size={15} /></button>
                )}
              </div>
            ))}
            {data?.adjustments.length === 0 && <p className="eyebrow">لا توجد بنود لهذا الشهر.</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function Advances({ people }: { people: Person[] }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, reload } = useLoad<{ advances: Advance[] }>('/payroll/advances')
  const [person, setPerson] = useState<Person | null>(null)
  const [amount, setAmount] = useState('')
  const [installment, setInstallment] = useState('')
  const [month, setMonth] = useState(thisMonth)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(amount) > 0 && Number(installment) > 0 ? Math.ceil(Number(amount) / Number(installment)) : 0

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!person) return setError('اختر الموظف.')
    setBusy(true); setError(null)
    try {
      await api('/payroll/advances', { method: 'POST', body: { user_id: person.id, amount: Number(amount), installment: Number(installment), start_month: month, reason: reason.trim() || null } })
      toast('سُجّلت السلفة')
      setAmount(''); setInstallment(''); setReason(''); setPerson(null)
      void reload()
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'حدث خطأ.')
    } finally { setBusy(false) }
  }

  return (
    <div className="af-grid2 af-extras">
      <form className="card glass af-pad form-grid" onSubmit={add}>
        <h2 className="af-h2"><HandCoins size={18} /> سلفة جديدة</h2>
        <Field label="الموظف">{() => <PersonPicker people={people} value={person} onChange={setPerson} label="الموظف" />}</Field>
        <div className="af-row2">
          <Field label="مبلغ السلفة">{(id) => <input id={id} className="input num af-big-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />}</Field>
          <Field label="قيمة القسط المقترح">{(id) => <input id={id} className="input num af-big-input" inputMode="decimal" dir="ltr" value={installment} onChange={(e) => setInstallment(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />}</Field>
        </div>
        <Field label="أول شهر متاح للتسديد">{(id) => <MonthField id={id} value={month} onChange={setMonth} />}</Field>
        <Field label="ملاحظة (اختياري)">{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {n > 0 && <p className="af-explain">تُسدَّد على <b className="num">{n}</b> {n === 1 ? 'دفعة' : 'دفعات'} تقريباً، بقسط <b className="num">{fmt(Number(installment))}</b> شيكل عند اعتماد شؤون الموظفين للقسط.</p>}
        <ErrorBanner text={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={!amount || !installment}>تسجيل السلفة</Button>
      </form>
      <section className="card glass af-pad">
        <h2 className="af-h2">السلف</h2>
        {loading && !data ? <Loading /> : (
          <div className="af-adv-list">
            {data?.advances.map((a) => {
              const pct = a.amount > 0 ? Math.round((a.paid / a.amount) * 100) : 0
              return (
                <div key={a.id} className="af-adv">
                  <div className="af-row-between"><b>{a.user?.name}</b>{a.remaining <= 0 ? <Pill tone="ok">سُدّدت</Pill> : <span className="num">{fmt(a.remaining)} متبقٍّ</span>}</div>
                  <div className="af-bar-track"><span style={{ width: `${pct}%` }} /></div>
                  <small className="af-sub">{fmt(a.paid)} من {fmt(a.amount)} · القسط {fmt(a.installment)} · من {monthLabel(a.start_month)}{a.reason ? ` · ${a.reason}` : ''}</small>
                  {a.paid === 0 && (
                    <button type="button" className="link-btn" onClick={async () => {
                      if (!(await confirm({ title: 'حذف السلفة؟', danger: true, confirmLabel: 'حذف' }))) return
                      try { await api(`/payroll/advances/${a.id}`, { method: 'DELETE' }); void reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'لم تُحذف', 'danger') }
                    }}>حذف</button>
                  )}
                </div>
              )
            })}
            {data?.advances.length === 0 && <p className="eyebrow">لا توجد سلف.</p>}
          </div>
        )}
      </section>
    </div>
  )
}
