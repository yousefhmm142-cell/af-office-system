import { ChevronDown, HandCoins, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Pill } from '../../ui/primitives'
import { fmt, monthLabel, STATUS, type Advance, type Batch, type Item } from './lib'

/** Every pay the person received, clearly: the net in big numbers, the breakdown one tap away. */
export function MyPay() {
  const { data, error, loading } = useLoad<{ items: Array<Item & { batch: Batch }>; advances: Advance[] }>('/payroll/mine')
  const [open, setOpen] = useState<number | null>(null)
  if (loading && !data) return <Loading />
  return (
    <>
      <PageHead title="رواتبي" eyebrow="دفعاتك المعتمدة وتفاصيلها" />
      <ErrorBanner text={error} />
      {data?.advances.map((a) => (
        <div key={a.id} className="banner info af-mb"><HandCoins size={18} /><p>عليك سلفة متبقٍّ منها <b className="num">{fmt(a.remaining)}</b> شيكل، يُخصم منها <b className="num">{fmt(a.installment)}</b> من كل دفعة.</p></div>
      ))}
      {data?.items.length === 0 ? (
        <section className="card glass af-empty-hero"><span className="af-empty-ico"><Wallet size={34} /></span><h2>لا توجد دفعات بعد</h2><p className="eyebrow">تظهر هنا دفعاتك بعد اعتمادها.</p></section>
      ) : (
        <div className="af-pay-cards">
          {data?.items.map((i) => (
            <section key={i.id} className="card glass af-pay-card">
              <button type="button" className="af-pay-head" aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>
                <span><small>{monthLabel(i.batch.month)} · {i.batch.percent}%</small><b>{i.batch.title}</b></span>
                <span className="af-pay-net"><b className="num">{fmt(i.net)}</b><small>شيكل</small></span>
                <Pill tone={STATUS[i.batch.status].tone}>{STATUS[i.batch.status].label}</Pill>
                <ChevronDown size={18} className="af-chev" />
              </button>
              {open === i.id && (
                <div className="af-breakdown">
                  <p><span>الأساسي</span><b className="num">{fmt(i.base)}</b></p>
                  {i.overtime > 0 && <p className="plus"><span>الوقت الإضافي</span><b className="num">+{fmt(i.overtime)}</b></p>}
                  {i.bonuses > 0 && <p className="plus"><span>المكافآت</span><b className="num">+{fmt(i.bonuses)}</b></p>}
                  {i.auto_deductions > 0 && <p className="minus"><span>خصم التأخير والغياب</span><b className="num">−{fmt(i.auto_deductions)}</b></p>}
                  {i.manual_deductions > 0 && <p className="minus"><span>خصومات أخرى</span><b className="num">−{fmt(i.manual_deductions)}</b></p>}
                  {i.advance_deduction > 0 && <p className="minus"><span>قسط السلفة</span><b className="num">−{fmt(i.advance_deduction)}</b></p>}
                  {i.details?.adjustments.map((a, k) => <p key={k} className="af-sub">{a.type === 'bonus' ? 'مكافأة' : 'خصم'}: {a.reason} ({fmt(a.amount)})</p>)}
                  <p className="af-breakdown-net"><span>الصافي</span><b className="num">{fmt(i.net)}</b></p>
                  {i.details && <p className="af-sub">حضور {i.details.present_days} يوماً · غياب {i.details.absent_days} · تأخير {i.details.late_minutes} دقيقة · إضافي {i.details.overtime_minutes} دقيقة</p>}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
