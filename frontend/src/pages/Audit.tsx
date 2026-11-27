import { Building2, CalendarCheck, ClipboardList, History, KeyRound, LayoutGrid, Stamp, UserRound, Wallet, Zap } from 'lucide-react'
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
  'branch.backup': 'تنزيل نسخة احتياطية للفرع', 'branch.department_assigned': 'إضافة قسم للفرع', 'branch.maintenance_plan': 'تعديل جدول صيانة المولدات',
  'generation.submit': 'إرسال تقرير التوليد', 'generation.approve': 'اعتماد تقرير التوليد', 'generation.return': 'إعادة فتح تقرير التوليد',
  'generation.edit_closed': 'تعديل تقرير توليد مرسل', 'generation.equipment': 'إضافة أو تعديل مولد أو نوع وقود',
  'distribution.submit': 'إرسال كشف التوزيع', 'distribution.approve': 'اعتماد كشف التوزيع', 'distribution.return': 'إعادة فتح كشف التوزيع',
  'distribution.edit_closed': 'تعديل كشف توزيع مرسل', 'distribution.zone': 'إضافة أو تعديل منطقة توزيع',
  'seals.add-roll': 'تسجيل رول أختام', 'seals.update-roll': 'تعديل رول أختام', 'seals.delete-roll': 'حذف رول أختام', 'seals.issue': 'صرف دفعة أختام',
  'seals.assign-batch': 'تسمية دفعة أختام', 'seals.update-batch': 'تعديل دفعة أختام', 'seals.add-to-batch': 'إضافة أختام لدفعة', 'seals.delete-batch': 'حذف دفعة أختام',
  'seals.record': 'تسجيل استخدام ختم', 'seals.return-to-stock': 'إرجاع أختام إلى المخزن', 'seals.import': 'استيراد ملفات الأختام',
  'employee.field_report': 'تقرير أداء ميداني', 'employee.roster': 'تعديل الجدول الأسبوعي',
  'leave.allowance': 'تحديد رصيد إجازة', 'leave.decision': 'قرار في طلب إجازة', 'leave.requested': 'طلب إجازة أو إذن',
  'messages.sms_sent': 'إرسال رسالة SMS', 'tasks.subscribers.import': 'استيراد قائمة المشتركين',
  'user.created': 'إضافة حساب', 'user.updated': 'تعديل حساب', 'user.deleted': 'حذف حساب', 'user.password_reset': 'إصدار رمز مؤقت',
  'user.password_changed': 'تغيير كلمة المرور', 'branch.created': 'إضافة فرع', 'branch.updated': 'تعديل فرع', 'branch.modules': 'تعديل أقسام فرع',
  'branch.deleted': 'حذف فرع', 'schedule.created': 'إضافة دوام', 'schedule.updated': 'تعديل دوام', 'schedule.deleted': 'حذف دوام',
  'holiday.created': 'إضافة عطلة', 'holiday.deleted': 'حذف عطلة', 'department.created': 'إضافة قسم', 'department.updated': 'تعديل قسم',
  'permissions.branch_page': 'تغيير الصفحات المفتوحة داخل الفرع',
  'department.deleted': 'حذف قسم', 'permissions.role': 'تعديل صلاحيات دور', 'permissions.user': 'تعديل صلاحيات شخص',
  'employee.profile_completed': 'استكمال الملف الشخصي', 'assistant.asked': 'سؤال للمساعد الذكي',
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
  { key: 'leave', label: 'الإجازات', icon: CalendarCheck },
  { key: 'generation', label: 'التوليد', icon: Zap },
  { key: 'distribution', label: 'التوزيع', icon: LayoutGrid },
  { key: 'seals', label: 'الأختام', icon: Stamp },
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
