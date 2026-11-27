import { CalendarRange, CircleDollarSign, HandCoins, Minus, Plus, Trash2 } from 'lucide-react'
import { NxAvatar, NxCard, NxEmpty, NxTabs } from '../../ui/nx'
import { MonthField } from '../../ui/MonthField'
import { useMemo, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../api/client'
import { can, useUser } from '../../app/auth'
import type { User } from '../../api/types'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner, Field } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Crumbs } from '../../ui/Crumbs'
import { PersonPicker, type Person } from '../../ui/PersonPicker'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, thisMonth, type Adjustment, type Advance } from './lib'

/** Deductions, bonuses and advances: one simple form on top, the list under it. */
export function Extras() {
  const [tab, setTab] = useState<'adj' | 'adv'>(() => new URLSearchParams(window.location.search).get('tab') === 'advances' ? 'adv' : 'adj')
  const users = useLoad<{ users: User[] }>('/users?status=active')
  const people = useMemo<Person[]>(() => (users.data?.users ?? []).map((u) => ({ id: u.id, name: u.name, sub: [u.job_title ?? u.role?.name, u.branch?.name].filter(Boolean).join(' · ') })), [users.data])
  return (
    <div className="nx nxx">
      <Crumbs trail={[{ label: 'الرواتب', to: '/payroll' }, { label: tab === 'adv' ? 'السلف' : 'الخصومات والمكافآت' }]} />
      <PageHead title="الخصومات والمكافآت والسلف" eyebrow="تدخل في أول دفعة رواتب للشهر المحدد" />
      <NxTabs label="النوع" value={tab} onChange={(v) => setTab(v as 'adj' | 'adv')} tabs={[
        { key: 'adj', label: 'الخصومات والمكافآت', icon: <HandCoins size={16} /> },
        { key: 'adv', label: 'السلف', icon: <CircleDollarSign size={16} /> },
      ]} />
      {tab === 'adj' ? <Adjustments people={people} /> : <Advances people={people} />}
    </div>
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
    <div className="nxx-grid">
      <form className="nx-card nxx-form" onSubmit={add}>
        <header className="nx-card-head"><h3><span className="nx-card-ico"><Plus size={17} /></span>بند جديد</h3></header>
        <div className="nxx-types" role="radiogroup" aria-label="النوع">
          {hr && <button type="button" role="radio" data-hue="rose" aria-checked={type === 'deduction'} onClick={() => setType('deduction')}><span className="nx-ico"><Minus size={18} /></span><b>خصم</b><small>يُطرح من الراتب</small></button>}
          <button type="button" role="radio" data-hue="mint" aria-checked={type === 'bonus'} onClick={() => setType('bonus')}><span className="nx-ico"><Plus size={18} /></span><b>مكافأة</b><small>تُضاف إلى الراتب</small></button>
        </div>
        <Field label="الموظف" error={fields.user_id}>{() => <PersonPicker people={people} value={person} onChange={setPerson} label="الموظف" />}</Field>
        <div className="af-row2">
          <Field label="المبلغ" error={fields.amount}>{(id) => <span className="nxx-money"><input id={id} className="input num" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /><i>₪</i></span>}</Field>
          <Field label="عن شهر" error={fields.month}>{(id) => <MonthField id={id} value={month} onChange={setMonth} />}</Field>
        </div>
        <Field label="السبب" error={fields.reason}>{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'bonus' ? 'مثال: مكافأة إنجاز' : 'مثال: تلف معدّات'} />}</Field>
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={!amount || !reason.trim()}>{type === 'bonus' ? 'إضافة المكافأة' : 'إضافة الخصم'}</Button>
      </form>
      <NxCard title={`بنود ${monthLabel(month)}`} icon={<CalendarRange size={17} />} action={data && data.adjustments.length > 0 ? <span className="nxx-total num">
          <span data-hue="mint">+{fmt(data.adjustments.filter((a) => a.type === 'bonus').reduce((n, a) => n + Number(a.amount), 0))}</span>
          <span data-hue="rose">−{fmt(data.adjustments.filter((a) => a.type !== 'bonus').reduce((n, a) => n + Number(a.amount), 0))}</span></span> : undefined}>
        {loading && !data ? <Loading /> : (
          <div className="nxx-rows">
            {data?.adjustments.map((a) => (
              <div key={a.id} className="nxx-row">
                <span className="nx-ico" data-hue={a.type === 'bonus' ? 'mint' : 'rose'}>{a.type === 'bonus' ? <Plus size={17} /> : <Minus size={17} />}</span>
                <span className="nxx-row-t"><b>{a.user?.name}</b><small>{a.reason}</small></span>
                <b className="num nxx-amt" data-hue={a.type === 'bonus' ? 'mint' : 'rose'}>{a.type === 'bonus' ? '+' : '−'}{fmt(a.amount)}</b>
                <span className="nx-chip" data-hue={a.batch ? (a.batch.status === 'draft' ? 'amber' : 'mint') : 'slate'}>{a.batch ? (a.batch.status === 'draft' ? 'في مسودة' : 'صُرف') : 'ينتظر دفعة'}</span>
                {(!a.batch || a.batch.status === 'draft') && (
                  <button type="button" className="nx-icon-btn" aria-label={`حذف بند ${a.user?.name}`} onClick={async () => {
                    if (!(await confirm({ title: 'حذف البند؟', danger: true, confirmLabel: 'حذف' }))) return
                    try { await api(`/payroll/adjustments/${a.id}`, { method: 'DELETE' }); void reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحذف', 'danger') }
                  }}><Trash2 size={15} /></button>
                )}
              </div>
            ))}
            {data?.adjustments.length === 0 && <NxEmpty icon={<HandCoins size={26} />} title="لا توجد بنود لهذا الشهر" text="أضف خصماً أو مكافأة من النموذج، فيدخل في أول دفعة للشهر." />}
          </div>
        )}
      </NxCard>
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
    <div className="nxx-grid">
      <form className="nx-card nxx-form" onSubmit={add}>
        <header className="nx-card-head"><h3><span className="nx-card-ico"><CircleDollarSign size={17} /></span>سلفة جديدة</h3></header>
        <Field label="الموظف">{() => <PersonPicker people={people} value={person} onChange={setPerson} label="الموظف" />}</Field>
        <div className="af-row2">
          <Field label="مبلغ السلفة">{(id) => <span className="nxx-money"><input id={id} className="input num" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /><i>₪</i></span>}</Field>
          <Field label="القسط الشهري">{(id) => <span className="nxx-money"><input id={id} className="input num" inputMode="decimal" dir="ltr" value={installment} onChange={(e) => setInstallment(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /><i>₪</i></span>}</Field>
        </div>
        <Field label="أول شهر متاح للتسديد">{(id) => <MonthField id={id} value={month} onChange={setMonth} />}</Field>
        <Field label="ملاحظة (اختياري)">{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {n > 0 && <p className="nxw-note" data-hue="amber">تُسدَّد على <b className="num">{n}</b> {n === 1 ? 'دفعة' : 'دفعات'} تقريباً، بقسط <b className="num">{fmt(Number(installment))}</b> شيكل عند اعتماد شؤون الموظفين للقسط.</p>}
        <ErrorBanner text={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={!amount || !installment}>تسجيل السلفة</Button>
      </form>
      <NxCard title="السلف" icon={<HandCoins size={17} />}>
        {loading && !data ? <Loading /> : (
          <div className="nxx-rows">
            {data?.advances.map((a) => {
              const pct = a.amount > 0 ? Math.round((a.paid / a.amount) * 100) : 0
              return (
                <div key={a.id} className="nxx-adv">
                  <NxAvatar name={a.user?.name ?? '؟'} size={40} />
                  <div className="nxx-adv-main">
                    <div className="nxx-adv-top"><b>{a.user?.name}</b>{a.remaining <= 0 ? <span className="nx-chip nx-chip-dot" data-hue="mint">سُدّدت</span> : <span className="num nxx-left">{fmt(a.remaining)} ₪ متبقٍّ</span>}</div>
                    <div className="nx-progress" data-hue={a.remaining <= 0 ? 'mint' : 'amber'}><i style={{ width: `${pct}%` }} /></div>
                    <small>سُدّد {fmt(a.paid)} من {fmt(a.amount)} · القسط {fmt(a.installment)} · من {monthLabel(a.start_month)}{a.reason ? ` · ${a.reason}` : ''}</small>
                  </div>
                  {a.paid === 0 && (
                    <button type="button" className="nx-icon-btn" aria-label={`حذف سلفة ${a.user?.name}`} onClick={async () => {
                      if (!(await confirm({ title: 'حذف السلفة؟', danger: true, confirmLabel: 'حذف' }))) return
                      try { await api(`/payroll/advances/${a.id}`, { method: 'DELETE' }); void reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'لم تُحذف', 'danger') }
                    }}><Trash2 size={16} /></button>
                  )}
                </div>
              )
            })}
            {data?.advances.length === 0 && <NxEmpty icon={<CircleDollarSign size={26} />} title="لا توجد سلف" text="سجّل السلفة وقسطها، ثم تختار شؤون الموظفين خصم القسط في كل دفعة." />}
          </div>
        )}
      </NxCard>
    </div>
  )
}
