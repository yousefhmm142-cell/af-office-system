import { todayISO } from '../../lib/dates'
import { formatAmount } from '../../lib/numbers'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { SheetHistory } from '../sheets/SheetHistory'
import type { DistributionData } from './DistributionPage'

export function DistributionHistoryPage() {
  useDocumentTitle('الكشوف السابقة')
  const today = todayISO()
  const { data, error } = useLoad<DistributionData>(`/distribution/${today}`)
  return <div className="gen-page distribution-page">
    <ErrorBanner text={error} />
    {!error && <SheetHistory
      title="الكشوف السابقة"
      todayLabel="كشف اليوم"
      todayHref="/distribution"
      emptyText="ستظهر كشوف التوزيع هنا بعد تعبئتها."
      todayMissing={!!data && data.can.fill && !data.sheet}
      items={data?.history.map((sheet) => ({
        id: sheet.sheet_date,
        date: sheet.sheet_date,
        status: sheet.status,
        href: `/distribution/${sheet.sheet_date}`,
        figures: <><span>ساعات <b>{formatAmount(sheet.hours)}</b></span><span>تشغيلات <b>{sheet.runs}</b></span></>,
      }))}
    />}
  </div>
}
