import { Building2, CalendarCheck2, ClipboardCheck, History, House, IdCard, KeyRound, UserRound, Users } from 'lucide-react'
import type { User } from '../api/types'
import { can } from './auth'

export interface NavItem { to: string; label: string; icon: typeof House }

export function navFor(user: User): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'الرئيسية', icon: House }, { to: '/me', label: 'ملفي', icon: IdCard }]
  if (user.branch && user.modules?.includes('attendance')) items.push({ to: '/attendance/me', label: 'حضوري', icon: CalendarCheck2 })
  if (can(user, 'attendance.view')) items.push({ to: '/attendance', label: 'حضور الفرع', icon: ClipboardCheck })
  if (can(user, 'branches.view')) items.push({ to: '/branches', label: 'الفروع', icon: Building2 })
  if (can(user, 'users.view')) items.push({ to: '/users', label: 'الموظفين', icon: Users })
  if (can(user, 'permissions.manage')) items.push({ to: '/permissions', label: 'الصلاحيات', icon: KeyRound })
  if (can(user, 'audit.view')) items.push({ to: '/audit', label: 'سجل الحركات', icon: History })
  items.push({ to: '/account', label: 'حسابي', icon: UserRound })
  return items
}
