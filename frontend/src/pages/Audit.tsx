import { Building2, CalendarCheck, ClipboardList, History, KeyRound, UserRound, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatLongDate, formatTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button } from '../ui/primitives'

interface Entry {
  id: number; action: string; subject_type: string | null; subject_name: string | null; created_at: string; reason: string | null
  user: { id: number; name: string } | null; branch: { id: number; name: string } | null; new_values: Record<string, unknown> | null
}
interface Page { data: Entry[]; current_page: number; last_page: number; total: number }

const ACTIONS: Record<string, string> = {
  'user.created': 'إضافة حساب', 'user.updated': 'تعديل حساب', 'user.deleted': 'حذف حساب', 'user.password_reset': 'إصدار رمز مؤقت',
  'user.password_changed': 'تغيير كلمة المرور', 'branch.created': 'إضافة فرع', 'branch.updated': 'تعديل فرع', 'branch.modules': 'تعديل أقسام فرع',
  'branch.deleted': 'حذف فرع', 'schedule.created': 'إضافة دوام', 'schedule.updated': 'تعديل دوام', 'schedule.deleted': 'حذف دوام',
  'holiday.created': 'إضافة عطلة', 'holiday.deleted': 'حذف عطلة', 'department.created': 'إضافة قسم', 'department.updated': 'تعديل قسم',
  'permissions.branch_page': 'تغيير الصفحات المفتوحة داخل الفرع',
  'department.deleted': 'حذف قسم', 'permissions.role': 'تعديل صلاحيات دور', 'permissions.user': 'تعديل صلاحيات شخص',
  'employee.profile_completed': 'استكمال الملف الشخصي',
  'employee.personal': 'تعديل البيانات الشخصية', 'employee.job': 'تعديل بيانات العمل', 'employee.status': 'تغيير حالة موظف',
  'employee.attachment_added': 'إضافة مرفق', 'employee.attachment_deleted': 'حذف مرفق',
  'attendance.edited': 'تعديل حضور يدوياً', 'attendance.approved': 'اعتماد أيام حضور', 'attendance.point_created': 'إضافة نقطة حضور',
  'attendance.point_updated': 'تعديل نقطة حضور', 'attendance.network_added': 'إضافة شبكة مكتب', 'attendance.network_removed': 'حذف شبكة مكتب',
  'attendance.location': 'تحديد موقع المكتب', 'attendance.code_rotated': 'تغيير رمز QR',
  'payroll.settings': 'تعديل قواعد الرواتب', 'payroll.batch_created': 'إنشاء دفعة رواتب', 'payroll.batch_approved': 'اعتماد دفعة رواتب',
  'payroll.batch_paid': 'صرف دفعة رواتب', 'payroll.batch_deleted': 'حذف دفعة رواتب', 'payroll.adjustment_added': 'إضافة خصم أو مكافأة',
  'payroll.adjustment_deleted': 'حذف خصم أو مكافأة', 'payroll.advance_added': 'إضافة سلفة', 'payroll.advance_deleted': 'حذف سلفة',
}

const SECTIONS = [
  { key: '', label: 'الكل', icon: History },
  { key: 'user', label: 'الحسابات', icon: UserRound },
  { key: 'employee', label: 'الموظفون', icon: UserRound },
  { key: 'attendance', label: 'الحضور', icon: CalendarCheck },
  { key: 'payroll', label: 'الرواتب', icon: Wallet },
  { key: 'branch', label: 'الفروع', icon: Building2 },
  { key: 'permissions', label: 'الصلاحيات', icon: KeyRound },
  { key: 'schedule', label: 'الدوام', icon: ClipboardList },
]

/** Every sensitive change, newest first, with who did it, where, and on what. */
export function Audit() {
  const [section, setSection] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Entry[]>([])
  const { data, error, loading } = useLoad<Page>(`/audit?page=${page}${section ? `&action=${section}.` : ''}`)

  useEffect(() => { if (data) setRows((r) => (data.current_page === 1 ? data.data : [...r, ...data.data])) }, [data])

  // Group by day for easier reading.
  const days: Array<[string, Entry[]]> = []
  for (const e of rows) {
    const label = formatLongDate(new Date(e.created_at))
    const last = days[days.length - 1]
    if (last && last[0] === label) last[1].push(e)
    else days.push([label, [e]])
  }

  return (
    <>
      <PageHead title="سجل الحركات" eyebrow={data ? `كل تعديل مهم: من قام به، ومتى، وعلى ماذا · ${data.total} حركة` : 'كل تعديل مهم: من قام به، ومتى، وعلى ماذا'} />
      <div className="chips af-pad-b">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className="chip" aria-pressed={section === s.key} onClick={() => { setSection(s.key); setPage(1); setRows([]) }}>
            <s.icon size={15} /> {s.label}
          </button>
        ))}
      </div>
      <ErrorBanner text={error} />
      {loading && rows.length === 0 ? <Loading /> : rows.length === 0 ? (
        <section className="card glass af-empty-hero"><span className="af-empty-ico"><History size={34} /></span><h2>لا توجد حركات</h2><p className="eyebrow">تُسجَّل هنا تلقائياً كل إضافة أو تعديل أو حذف مهم.</p></section>
      ) : (
        <>
          {days.map(([day, list]) => (
            <section key={day} className="af-audit-day">
              <h3 className="af-h3">{day}</h3>
              <div className="card glass rows">
                {list.map((e) => (
                  <div key={e.id} className="row af-audit-row">
                    <span className="row-label">
                      {ACTIONS[e.action] ?? e.action}{e.subject_name ? <> · <b>{e.subject_name}</b></> : null}
                      <small className="af-sub">{e.user?.name ?? 'النظام'}{e.branch ? ` · فرع ${e.branch.name}` : ''}{e.reason ? ` · السبب: ${e.reason}` : ''}</small>
                    </span>
                    <span className="row-value num">{formatTime(new Date(e.created_at))}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {data && data.current_page < data.last_page && (
            <div className="af-more"><Button busy={loading} onClick={() => setPage(data.current_page + 1)}>عرض المزيد</Button></div>
          )}
        </>
      )}
    </>
  )
}
