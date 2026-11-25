import { LayoutGrid } from 'lucide-react'
import { useUser } from '../../app/auth'
import { ReportDownloads } from '../../ui/ReportDownloads'
import { useLoad } from '../../lib/useLoad'
import { defaultAlertSettings } from '../generation/model'
import { ReportPage } from '../sheets/ReportPage'
import { useReportDate } from '../sheets/ReportDate'
import type { DistributionData } from './DistributionPage'
import { PrintSheet } from './PrintSheet'
import { SheetView } from './SheetView'

export function DistributionReportPage() {
  const date = useReportDate()
  return <DistributionReport key={date} date={date} />
}

function DistributionReport({ date }: { date: string }) {
  const user = useUser()
  const load = useLoad<DistributionData>(`/distribution/${date}`)
  const data = load.data
  const sheet = data?.sheet ?? null
  const zoneNames = new Map(data?.zones.map((zone) => [zone.id, zone.name]))

  return <ReportPage module="distribution" title="كشف التوزيع والأحمال" subtitle="التوزيع · الكشف اليومي" source="مشرف التوزيع"
    noun="الكشف" icon={LayoutGrid} date={date} entry={`/sheet/${date}`} latest="/distribution/history"
    sheet={sheet} canFill={data?.can.fill === true} canApprove={data?.can.approve === true}
    extraActions={sheet && <ReportDownloads excelOnly name={`كشف التوزيع ${date}`} headers={['المنطقة', 'ساعات التغذية', 'التشغيلات']}
      rows={sheet.zones.map((zone) => [zoneNames.get(zone.zoneId) ?? 'منطقة', zone.supplyHours ?? '—',
        zone.runs.map((run) => [run.start, run.end].filter(Boolean).join(' – ')).filter(Boolean).join(' / ')])} />}
    error={load.error} loading={load.loading} onReload={load.reload}>
    {sheet && <>
      <SheetView sheet={sheet} ctx={{ zoneNames, names: new Map([[String(user.id), user.name]]), settings: defaultAlertSettings }} />
      <PrintSheet sheet={sheet} zoneNames={zoneNames} branchName={data?.branch_name} />
    </>}
  </ReportPage>
}
