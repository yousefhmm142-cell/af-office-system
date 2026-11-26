import { FileBarChart, Building2, CalendarCheck2, ClipboardCheck, ClipboardList, ListTodo, History, House, IdCard, KeyRound, Mail, Settings, UserRound, Users, Wallet, WalletCards, Zap, LayoutGrid, Stamp } from 'lucide-react'
import type { User } from '../api/types'
import { can, scopeOf } from './auth'

export interface NavItem { to: string; label: string; icon: typeof House }

export function navFor(user: User): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'الرئيسية', icon: House }]
  if (user.branch && user.modules?.includes('tasks') && user.field_worker) items.push({ to: '/my-tasks', label: 'مهامي', icon: ListTodo })
  if (user.branch && user.modules?.includes('attendance')) items.push({ to: '/attendance/me', label: 'حضوري', icon: CalendarCheck2 })
  items.push({ to: '/messages', label: 'المراسلات', icon: Mail })
  // Personal pay and file only for people who have an employee record.
  if (user.status) items.push({ to: '/my-pay', label: 'رواتبي', icon: Wallet }, { to: '/me', label: 'ملفي', icon: IdCard })
  const manager = user.role?.key === 'branch_manager'
  if (can(user, 'tasks.view') || can(user, 'tasks.manage')) items.push({ to: '/tasks', label: manager ? 'المهام' : 'المهام الميدانية', icon: ClipboardList })
  if (can(user, 'payroll.view') || can(user, 'payroll.manage')) items.push({ to: '/payroll', label: 'الرواتب', icon: WalletCards })
  if (can(user, 'attendance.view')) items.push({ to: '/attendance', label: scopeOf(user, 'attendance.view') === 'all' ? 'حضور الفروع' : manager ? 'الحضور' : 'الحضور والانصراف', icon: ClipboardCheck })
  if (can(user, 'generation.view') && user.modules?.includes('generation')) items.push({ to: '/generation', label: 'التوليد', icon: Zap })
  if (can(user, 'distribution.view') && user.modules?.includes('distribution')) items.push({ to: '/distribution', label: 'التوزيع', icon: LayoutGrid })
  if (can(user, 'seals.manage') && user.modules?.includes('seals')) items.push({ to: '/seals', label: 'الأختام', icon: Stamp })
  if (can(user, 'seals.view') && user.modules?.includes('seals')) items.push({ to: '/tasks/seal-work', label: 'كشف أعمال الأختام', icon: ClipboardList })
  // Weekly and monthly reports of the branch (generation, distribution, tasks, attendance).
  if (user.branch && (can(user, 'permissions.branch_manage') || can(user, 'generation.view') || can(user, 'tasks.view'))) items.push({ to: '/reports', label: 'التقارير', icon: FileBarChart })
  if (can(user, 'branches.view')) items.push({ to: '/branches', label: 'الفروع', icon: Building2 })
  if (can(user, 'users.view')) items.push({ to: '/users', label: 'الموظفين', icon: Users })
  if (can(user, 'permissions.manage')) items.push({ to: '/permissions', label: 'الصلاحيات', icon: KeyRound })
  if (user.role?.key === 'branch_manager' && (can(user, 'users.manage') || can(user, 'permissions.branch_manage'))) items.push({ to: '/settings', label: 'الإعدادات', icon: Settings })
  if (can(user, 'audit.view')) items.push({ to: '/audit', label: 'سجل الحركات', icon: History })
  items.push({ to: '/account', label: 'حسابي', icon: UserRound })
  return items
}
