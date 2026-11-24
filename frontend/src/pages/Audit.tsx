import { useLoad } from '../lib/useLoad'
import { formatLongDate, formatTime } from '../lib/format'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'

interface Entry { id: number; action: string; subject_type: string | null; created_at: string; reason: string | null; user: { id: number; name: string } | null; new_values: Record<string, unknown> | null }

const ACTIONS: Record<string, string> = {
  'user.created': 'إضافة حساب', 'user.updated': 'تعديل حساب', 'user.deleted': 'حذف حساب', 'user.password_reset': 'رمز مؤقت',
  'user.password_changed': 'تغيير رمز', 'branch.created': 'إضافة فرع', 'branch.updated': 'تعديل فرع', 'branch.modules': 'أقسام فرع',
  'branch.deleted': 'حذف فرع', 'schedule.created': 'إضافة دوام', 'schedule.updated': 'تعديل دوام', 'schedule.deleted': 'حذف دوام',
  'holiday.created': 'إضافة عطلة', 'holiday.deleted': 'حذف عطلة', 'department.created': 'إضافة قسم', 'department.updated': 'تعديل قسم',
  'department.deleted': 'حذف قسم', 'permissions.role': 'صلاحيات دور', 'permissions.user': 'صلاحيات شخص',
}

export function Audit() {
  const { data, error, loading } = useLoad<{ data: Entry[] }>('/audit')
  return (
    <>
      <PageHead title="سجل الحركات" eyebrow="كل تعديل مهم: من قام به، ومتى، وما الذي تغيّر" />
      <ErrorBanner text={error} />
      {loading && !data ? <Loading /> : (
        <div className="card glass rows">
          {data?.data.map((e) => {
            const d = new Date(e.created_at)
            return (
              <div key={e.id} className="row">
                <span className="row-label">{ACTIONS[e.action] ?? e.action}<small className="af-sub">{e.user?.name ?? 'النظام'}{typeof e.new_values?.name === 'string' ? ` · ${e.new_values.name}` : ''}</small></span>
                <span className="row-value">{formatLongDate(d)} · {formatTime(d)}</span>
              </div>
            )
          })}
          {data?.data.length === 0 && <p className="eyebrow af-pad">لا توجد حركات بعد.</p>}
        </div>
      )}
    </>
  )
}
