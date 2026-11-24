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
  must_change_password: boolean
  is_locked: boolean
  last_login_at: string | null
  created_at: string | null
  permissions?: Record<string, Scope>
  modules?: string[]
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

export const SCOPE_LABEL: Record<Scope, string> = { own: 'إله بس', branch: 'فرعه', all: 'كل الفروع' }
/** ISO days, Saturday first (the local week). */
export const DAYS: Array<[number, string]> = [[6, 'السبت'], [7, 'الأحد'], [1, 'الاثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']]
