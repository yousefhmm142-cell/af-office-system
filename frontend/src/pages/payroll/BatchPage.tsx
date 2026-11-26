import { BadgeCheck, Banknote, ChevronDown, Download, Printer, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, ApiError, getToken } from '../../api/client'
import { config } from '../../config'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button, Pill } from '../../ui/primitives'
import { ScrollTable } from '../../ui/ScrollTable'
import { useToast } from '../../ui/Toast'
import { fmt, monthLabel, STATUS, type Batch, type Item } from './lib'

interface Data { batch: Batch; items: Item[]; can: { manage: boolean; approve: boolean } }

const TYPE: Record<string, string> = { monthly: 'شهري', weekly: 'أسبوعي', daily: 'يومية', contract: 'مقاولة' }

export function BatchPage() {
  const { id } = useParams()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { data, error, loading, setData } = useLoad<Data>(`/payroll/batches/${id}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const items = useMemo(() => (data?.items ?? []).filter((i) => !q.trim() || (i.user?.name ?? '').includes(q.trim())), [data, q])
  const sum = (k: keyof Item) => (data?.items ?? []).reduce((s, i) => s + Number(i[k] ?? 0), 0)

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const { batch, can } = data
  const steps: Array<[string, boolean]> = [['أُنشئت وحُسبت', true], ['اعتُمدت', batch.status !== 'draft'], ['صُرفت', batch.status === 'paid']]
  const missingWallet = data.items.filter((i) => !i.payment?.account_number).length

  async function act(key: string, path: string, method = 'POST', ok?: string) {
    setBusy(key)
    try {
      const res = await api<Data>(path, { method })
      setData(res)
      if (ok) toast(ok)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'حدث خطأ.', 'danger')
    } finally { setBusy(null) }
  }

  async function exportCsv() {
    const res = await fetch(`${config.apiBase}/payroll/batches/${batch.id}/export`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
    if (!res.ok) return toast('تعذّر التصدير.', 'danger')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `كشف-${batch.month}-${batch.id}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  return (
    <div className="af-batch">
      <PageHead title={batch.title} eyebrow={`${monthLabel(batch.month)} · ${batch.branch?.name ?? 'جميع الفروع'}`}
        actions={<Pill tone={STATUS[batch.status].tone}>{STATUS[batch.status].label}</Pill>} />

      <section className="af-hero glass">
        <div className="af-hero-main">
          <small>صافي الدفعة</small>
          <b className="num">{fmt(batch.total_net)}</b>
          <small>شيكل · {batch.employees_count} موظفاً · {batch.percent}% من الشهر</small>
        </div>
        <ol className="af-timeline" aria-label="مراحل الدفعة">
          {steps.map(([label, done], i) => <li key={label} data-done={done || undefined}><span className="num">{i + 1}</span>{label}</li>)}
        </ol>
        <div className="af-hero-actions no-print">
          {batch.status === 'draft' && can.approve && (
            <Button variant="approve" size="lg" icon={<BadgeCheck size={20} />} busy={busy === 'approve'}
              onClick={async () => { if (await confirm({ title: 'اعتماد الدفعة؟', message: 'بعد الاعتماد لا يمكن تعديل الدفعة أو إعادة حسابها.', confirmLabel: 'اعتماد' })) void act('approve', `/payroll/batches/${batch.id}/approve`, 'POST', 'اعتُمدت الدفعة') }}>
              اعتماد الدفعة
            </Button>
          )}
          {batch.status === 'approved' && can.manage && (
            <Button variant="approve" size="lg" icon={<Banknote size={20} />} busy={busy === 'paid'}
              onClick={async () => { if (await confirm({ title: 'تسجيل الصرف؟', message: 'سجّل الصرف بعد تحويل المبالغ إلى الموظفين.', confirmLabel: 'تم الصرف' })) void act('paid', `/payroll/batches/${batch.id}/paid`, 'POST', 'سُجّل الصرف') }}>
              تسجيل صرف الدفعة
            </Button>
          )}
          <Button icon={<Download size={18} />} onClick={() => void exportCsv()}>تنزيل كشف التحويل (CSV)</Button>
          <Button variant="utility" icon={<Printer size={18} />} onClick={() => window.print()}>طباعة كشف الصرف</Button>
          {batch.status === 'draft' && can.manage && (
            <>
              <Button icon={<RefreshCw size={18} />} busy={busy === 'recalc'} onClick={() => void act('recalc', `/payroll/batches/${batch.id}/recalculate`, 'POST', 'أُعيد الحساب')}>إعادة الحساب</Button>
              <Button variant="ghost" icon={<Trash2 size={18} />} onClick={async () => {
                if (!(await confirm({ title: 'حذف المسودة؟', message: 'تعود الخصومات والمكافآت إلى انتظار الدفعة القادمة.', confirmLabel: 'حذف', danger: true }))) return
                try { await api(`/payroll/batches/${batch.id}`, { method: 'DELETE' }); toast('حُذفت المسودة'); navigate('/payroll') } catch (e) { toast(e instanceof ApiError ? e.message : 'لم تُحذف', 'danger') }
              }}>حذف</Button>
            </>
          )}
        </div>
      </section>

      {batch.status === 'draft' && <p className="af-explain no-print">راجِع الأرقام. إذا أضفت خصماً أو مكافأة أو عدّلت الحضور، اضغط «إعادة الحساب». {batch.is_final ? 'هذه الدفعة تُكمل الشهر، فتشمل حساب الحضور.' : 'حساب الحضور يكون في الدفعة التي تُكمل الشهر.'}</p>}
      {missingWallet > 0 && <div className="banner warn no-print" role="status"><Wallet size={18} /><p>{missingWallet} موظفاً بلا رقم حساب أو محفظة في ملفه.</p></div>}

      <div className="af-sumrow no-print">
        <span>الأساسي <b className="num">{fmt(sum('base'))}</b></span>
        <span className="plus">الإضافي والمكافآت <b className="num">+{fmt(sum('overtime') + sum('bonuses'))}</b></span>
        <span className="minus">الخصومات <b className="num">−{fmt(sum('auto_deductions') + sum('manual_deductions'))}</b></span>
        <span className="minus">أقساط السلف <b className="num">−{fmt(sum('advance_deduction'))}</b></span>
      </div>

      <div className="af-toolbar no-print">
        <div className="af-search"><Search size={17} aria-hidden="true" /><input className="input" placeholder="ابحث عن موظف" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" /></div>
      </div>

      <div className="card glass af-table-wrap">
        <ScrollTable label="كشف الرواتب">
        <table className="tbl af-pay-table">
          <thead>
            <tr><th>الموظف</th><th>طريقة الصرف</th><th>الأساسي</th><th>إضافي ومكافآت</th><th>خصومات</th><th>سلفة</th><th>الصافي</th><th className="no-print" /></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <Fragment key={i.id}>
                <tr className={open === i.id ? 'open' : undefined}>
                  <td><b>{i.user?.name}</b><small className="af-sub">{TYPE[i.salary_type] ?? i.salary_type} · {fmt(i.salary_amount)}</small></td>
                  <td>{i.payment?.account_number ? <>{i.payment.provider ?? (i.payment.method === 'bank' ? 'بنك' : 'محفظة')}<small className="af-sub num" dir="ltr">{i.payment.account_number}</small></> : <span className="af-missing">غير محدد</span>}</td>
                  <td className="num">{fmt(i.base)}</td>
                  <td className="num plus">{i.overtime + i.bonuses > 0 ? `+${fmt(i.overtime + i.bonuses)}` : '—'}</td>
                  <td className="num minus">{i.auto_deductions + i.manual_deductions > 0 ? `−${fmt(i.auto_deductions + i.manual_deductions)}` : '—'}</td>
                  <td className="num minus">{i.advance_deduction > 0 ? `−${fmt(i.advance_deduction)}` : '—'}</td>
                  <td className="num af-net">{fmt(i.net)}</td>
                  <td className="no-print"><button type="button" className="icon-btn" aria-expanded={open === i.id} aria-label={`تفاصيل ${i.user?.name}`} onClick={() => setOpen(open === i.id ? null : i.id)}><ChevronDown size={16} /></button></td>
                </tr>
                {open === i.id && i.details && (
                  <tr className="af-detail no-print">
                    <td colSpan={8}>
                      <div className="af-detail-grid">
                        <span>أيام الحضور <b className="num">{i.details.present_days}</b></span>
                        <span>أيام الغياب <b className="num">{i.details.absent_days}</b>{i.details.absence_amount > 0 && <small> (−{fmt(i.details.absence_amount)})</small>}</span>
                        <span>دقائق التأخير <b className="num">{i.details.late_minutes}</b>{i.details.late_amount > 0 && <small> (−{fmt(i.details.late_amount)})</small>}</span>
                        <span>دقائق إضافية <b className="num">{i.details.overtime_minutes}</b>{i.overtime > 0 && <small> (+{fmt(i.overtime)})</small>}</span>
                        <span>أجر الساعة <b className="num">{fmt(i.details.hourly)}</b></span>
                      </div>
                      {i.details.adjustments.map((a, k) => <p key={k} className={a.type === 'bonus' ? 'plus' : 'minus'}>{a.type === 'bonus' ? 'مكافأة' : 'خصم'} <b className="num">{fmt(a.amount)}</b> · {a.reason}</p>)}
                      {i.details.notes.map((n, k) => <p key={`n${k}`} className="af-late">⚠ {n}</p>)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={6}>المجموع</th><th className="num af-net">{fmt(sum('net'))}</th><th className="no-print" /></tr></tfoot>
        </table>
        </ScrollTable>
        {items.length === 0 && <p className="eyebrow af-pad">لا يوجد موظفون في هذه الدفعة. تأكد من إدخال الراتب في ملف كل موظف.</p>}
      </div>
      <p className="af-print-foot">أعدّها: {batch.created_by ?? '—'}{batch.approved_by ? ` · اعتمدها: ${batch.approved_by}` : ''}</p>
    </div>
  )
}
