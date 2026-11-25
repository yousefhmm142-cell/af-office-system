import { stamp } from '../../lib/dates'

export function SignFooter({ approval }: { approval?: { submittedAt: string | null; approvedAt: string | null } }) {
  return <footer className="ps-foot">
    {approval && <div><b>توقيع مدير الموقع</b><span>{approval.submittedAt ? stamp(approval.submittedAt) : '____________________'}</span></div>}
    <div><b>اعتماد مدير المكتب</b><span>{approval?.approvedAt ? stamp(approval.approvedAt) : '____________________'}</span></div>
  </footer>
}
