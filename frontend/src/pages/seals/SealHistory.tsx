import { History } from 'lucide-react'
import { useState } from 'react'
import { stamp } from '../../lib/dates'
import { useLoad } from '../../lib/useLoad'
import { Dialog } from '../../ui/Dialog'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'

const labels: Record<string, string> = {
  'add-roll': 'تسجيل رول', 'update-roll': 'تعديل رول', 'delete-roll': 'حذف رول',
  issue: 'صرف دفعة', 'assign-batch': 'تسمية دفعة', 'update-batch': 'تعديل دفعة',
  'delete-batch': 'حذف دفعة', 'add-to-batch': 'إضافة أختام للدفعة',
  record: 'تسجيل ختم', 'return-to-stock': 'إعادة إلى المخزن', import: 'استيراد Excel',
}

export function SealHistoryButton({ record, label = 'السجل' }: { record?: string; table?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return <><Button variant="ghost" icon={<History size={16} />} onClick={() => setOpen(true)}>{label}</Button>
    {open && <SealHistory record={record} onClose={() => setOpen(false)} />}</>
}

function SealHistory({ record, onClose }: { record?: string; onClose(): void }) {
  const { data, error, loading } = useLoad<{ events: Array<{ id: number; action: string; actor: string | null; at: string }> }>(
    record ? `/seals/history?record=${encodeURIComponent(record)}` : '/seals/history',
  )
  return <Dialog open title="سجل حركات الأختام" className="seal-dialog" onClose={onClose}>
    <ErrorBanner text={error} />
    {loading ? <Loading /> : data?.events.length ? <ul className="rows">
      {data.events.map((event) => <li className="row" key={event.id}>
        <b>{labels[event.action.slice(6)]}</b><span>{event.actor ?? '—'} · {stamp(event.at)}</span>
      </li>)}
    </ul> : !error && <p className="muted">لا توجد حركات مسجّلة.</p>}
  </Dialog>
}
