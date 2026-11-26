import { Zap } from 'lucide-react'
import { useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ReportPage } from '../sheets/ReportPage'
import { useReportDate } from '../sheets/ReportDate'
import type { GenerationData } from './GenerationPage'
import { ReportView, reportContext } from './ReportView'
import { PrintSheet } from './PrintSheet'

export function GenerationReportPage() {
  const date = useReportDate()
  return <GenerationReport key={date} date={date} />
}

function GenerationReport({ date }: { date: string }) {
  const user = useUser()
  const load = useLoad<GenerationData>(`/generation/${date}`)
  const data = load.data
  const latest = data?.history.find((item) => item.status === 'submitted' || item.status === 'approved')
  const report = data?.report ?? null

  return <ReportPage module="generation" title="تقرير موقع التوليد" subtitle="التوليد · التقرير اليومي" source="موقع التوليد"
    noun="التقرير" icon={Zap} date={date} entry={`/entry/${date}`} latest={latest ? `/generation/${latest.report_date}` : '/generation'}
    sheet={report} canFill={data?.can.fill === true} canApprove={data?.can.approve === true}
    error={load.error} loading={load.loading} onReload={load.reload}>
    {report && data && <>
      <ReportView report={report} ctx={reportContext(report, data.generators, data.fuel_types, data.previous ? [data.previous] : [], new Map([[String(user.id), user.name]]), data.maintenance_plan)} />
      <PrintSheet report={report} generators={data.generators} fuelTypes={data.fuel_types} branchName={data.branch_name} />
    </>}
  </ReportPage>
}
