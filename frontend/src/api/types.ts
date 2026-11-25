export type Scope = 'own' | 'branch' | 'all'

export interface RoleRef { id: number; key: string; name: string; level: number }
export interface User {
  id: number
  uuid: string
  name: string
  username: string
  role: RoleRef | null
  branch: { id: number; name: string } | null
  is_active: boolean
  status?: EmployeeStatus | null
  job_title?: string | null
  must_change_password: boolean
  needs_profile_completion?: boolean
  is_locked: boolean
  last_login_at: string | null
  created_at: string | null
  permissions?: Record<string, Scope>
  modules?: string[]
  field_worker?: boolean
}

export interface BranchModule { key: string; name: string; enabled: boolean }
export interface Branch {
  id: number
  uuid: string
  name: string
  code: string | null
  is_active: boolean
  manager: { id: number; name: string } | null
  modules: BranchModule[]
  users_count: number
}

export interface Schedule {
  id: number
  branch_id: number
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  absent_after: string | null
  overtime_min_minutes: number
  overtime_round_minutes: number
  work_days: number[]
  is_default: boolean
}

export interface Role extends RoleRef { needs_branch: boolean; assignable: boolean }
export interface PermissionDef { id: number; key: string; name: string; group: string }
export interface RoleGrants extends RoleRef { locked: boolean; grants: Record<string, Scope> }
export interface Override { key: string; effect: 'allow' | 'deny'; scope: Scope | null }

export const SCOPE_LABEL: Record<Scope, string> = { own: 'بياناته فقط', branch: 'فرعه فقط', all: 'كل الفروع' }
/** ISO days, Saturday first (the local week). */
export const DAYS: Array<[number, string]> = [[6, 'السبت'], [7, 'الأحد'], [1, 'الاثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']]

export type EmployeeStatus = 'active' | 'trainee' | 'suspended' | 'terminated'
export const STATUS_LABEL: Record<EmployeeStatus, string> = { active: 'فعّال', trainee: 'متدرب', suspended: 'موقوف عن العمل', terminated: 'مفصول' }
export const EDUCATION: Array<[string, string]> = [['none', 'بدون'], ['primary', 'ابتدائي'], ['preparatory', 'إعدادي'], ['secondary', 'ثانوي'], ['diploma', 'دبلوم'], ['bachelor', 'بكالوريوس'], ['master', 'ماجستير'], ['phd', 'دكتوراه']]
export const SALARY_TYPES: Array<[string, string]> = [['monthly', 'شهري'], ['weekly', 'أسبوعي'], ['daily', 'يومية'], ['contract', 'مقاولة']]
export const ATTACHMENT_TYPES: Array<[string, string]> = [['id_photo', 'صورة الهوية'], ['specialty_cert', 'شهادة التخصص'], ['experience_cert', 'شهادة خبرة'], ['other', 'أخرى']]

export interface Personal {
  national_id: string | null; phone: string | null; wa_code: number; address: string | null; education_level: string | null
  specialty: string | null; gender: 'male' | 'female' | null; payment_method: 'wallet' | 'bank' | null; provider: string | null
  account_number: string | null; account_holder_name: string | null; account_holder_national_id: string | null; account_holder_phone: string | null
}
export interface Job {
  department_id: number | null; job_title: string | null; work_schedule_id: number | null; tracks_attendance: boolean; punch_anywhere: boolean
  salary_type: string | null; salary_amount: string | null; daily_hours: string; hire_date: string | null
  department: { id: number; name: string } | null; schedule: { id: number; name: string } | null
}
export interface Attachment { id: number; type: string; name: string; mime: string; size: number; created_at: string }
export interface EmployeeFile {
  annual_leave: { year: number; days: number | null; used: number }
  attendance: { month: string; late_minutes: number; absent_days: number }
  user: User; personal: Personal; job: Job; status: EmployeeStatus; termination_reason: string | null
  attachments: Attachment[]
  status_log: Array<{ from: string | null; to: EmployeeStatus; reason: string | null; by: string | null; at: string }>
  can: { edit_personal: boolean; edit_job: boolean; set_status: boolean }
}
