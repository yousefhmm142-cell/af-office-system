import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import { Guide } from '../pages/Guide'
import { More } from '../pages/More'
import { Account } from '../pages/Account'
import { Audit } from '../pages/Audit'
import { Inbox } from '../pages/messages/Inbox'
import { DailyTasks } from '../pages/tasks/DailyTasks'
import { SubscriberTasks } from '../pages/tasks/SubscriberTasks'
import { TasksBoard } from '../pages/tasks/Board'
import { LinkPage } from '../pages/tasks/LinkPage'
import { MyTasks } from '../pages/tasks/MyTasks'
import { TaskSettings } from '../pages/tasks/Settings'
import { BatchPage } from '../pages/payroll/BatchPage'
import { Extras } from '../pages/payroll/Extras'
import { Leaves } from '../pages/Leaves'
import { MyPay } from '../pages/payroll/MyPay'
import { PayrollHome } from '../pages/payroll/PayrollHome'
import { PayrollSettings } from '../pages/payroll/SettingsPage'
import { SealWorkPage } from '../pages/tasks/SealWorkPage'
import { DistributionEntryPage } from '../pages/distribution/DistributionPage'
import { DistributionReportPage } from '../pages/distribution/DistributionReportPage'
import { DistributionHistoryPage } from '../pages/distribution/DistributionHistoryPage'
import { SealIssuePage } from '../pages/seals/IssuePage'
import { SealLogPage } from '../pages/seals/LogPage'
import { SealRecentPage } from '../pages/seals/RecentPage'
import { SealUnrecordedPage } from '../pages/seals/UnrecordedPage'
import { SealLedger } from '../pages/seals/repo'
import '../styles/seals.css'
import '../styles/seals-night.css'
import { Board } from '../pages/attendance/Board'
import { GenerationEntryPage } from '../pages/generation/GenerationPage'
import { GenerationReportPage } from '../pages/generation/GenerationReportPage'
import { MyAttendance } from '../pages/attendance/MyAttendance'
import { Points } from '../pages/attendance/Points'
import { Scan } from '../pages/attendance/Scan'
import { BranchDetail } from '../pages/BranchDetail'
import { BranchSettings } from '../pages/BranchSettings'
import { Branches } from '../pages/Branches'
import { EmployeeFile } from '../pages/EmployeeFile'
import { ForcedPasswordChange } from '../pages/ChangePassword'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Permissions } from '../pages/Permissions'
import { Users } from '../pages/Users'
import { AppShell } from './AppShell'
import { can, useAuth, useUser } from './auth'

function Splash() {
  return <div className="splash" role="status" aria-label="جارٍ التحميل"><span className="spinner" aria-hidden="true" /></div>
}

/** Signed out → login (or first setup); temporary password → choose your own first. */
function Gate() {
  const { state } = useAuth()
  const { pathname } = useLocation()
  if (state.status === 'loading') return <Splash />
  if (state.status !== 'signed_in') return <Login />
  if (state.user.must_change_password) return <ForcedPasswordChange />
  if (state.user.needs_profile_completion && pathname !== "/me") return <Navigate to="/me" replace />
  return <Outlet />
}

function Need({ permission, children }: { permission: string; children: React.ReactNode }) {
  const user = useUser()
  return can(user, permission) ? <>{children}</> : <Navigate to="/" replace />
}

function NeedAny({ permissions, children }: { permissions: string[]; children: React.ReactNode }) {
  const user = useUser()
  return permissions.some((p) => can(user, p)) ? <>{children}</> : <Navigate to="/" replace />
}

function BranchSettingsGate() {
  const user = useUser()
  return user.role?.key === 'branch_manager' && (can(user, 'permissions.branch_manage') || can(user, 'users.manage'))
    ? <BranchSettings />
    : <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  // A technician's private task link: opens without signing in.
  { path: 't/:token', element: <LinkPage /> },
  {
    element: <Gate />,
    children: [
      { path: 'a/:code', element: <Scan /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Home /> },
          { path: 'branches', element: <Need permission="branches.view"><Branches /></Need> },
          { path: 'branches/:id', element: <Need permission="branches.view"><BranchDetail /></Need> },
          { path: 'users', element: <Need permission="users.view"><Users /></Need> },
          { path: 'settings', element: <BranchSettingsGate /> },
          { path: 'permissions', element: <Need permission="permissions.manage"><Permissions /></Need> },
          { path: 'audit', element: <Need permission="audit.view"><Audit /></Need> },
          { path: 'account', element: <Account /> },
          { path: 'more', element: <More /> },
          { path: 'guide', element: <Guide /> },
          { path: 'me', element: <EmployeeFile /> },
          { path: 'attendance/me', element: <MyAttendance /> },
          { path: 'my-tasks', element: <MyTasks /> },
          { path: 'tasks', element: <NeedAny permissions={['tasks.view', 'tasks.manage']}><TasksBoard /></NeedAny> },
          { path: 'subscriber', element: <NeedAny permissions={['tasks.view', 'tasks.manage']}><SubscriberTasks /></NeedAny> },
          { path: 'tasks/seal-work', element: <Need permission="seals.view"><SealWorkPage /></Need> },
          { path: 'my-attendance', element: <Navigate to="/attendance/me" replace /> },
          { path: 'tasks/daily', element: <NeedAny permissions={['tasks.view', 'tasks.manage']}><DailyTasks /></NeedAny> },
          { path: 'tasks/settings', element: <Need permission="tasks.manage"><TaskSettings /></Need> },
          { path: 'messages', element: <Inbox /> },
          { path: 'messages/:id', element: <Inbox /> },
          { path: 'leaves', element: <Leaves /> },
          { path: 'my-pay', element: <MyPay /> },
          { path: 'payroll', element: <NeedAny permissions={['payroll.view', 'payroll.manage']}><PayrollHome /></NeedAny> },
          { path: 'payroll/extras', element: <Need permission="payroll.manage"><Extras /></Need> },
          { path: 'payroll/settings', element: <Need permission="payroll.manage"><PayrollSettings /></Need> },
          { path: 'payroll/:id', element: <NeedAny permissions={['payroll.view', 'payroll.manage']}><BatchPage /></NeedAny> },
          { path: 'distribution', element: <Need permission="distribution.view"><DistributionReportPage /></Need> },
          { path: 'distribution/history', element: <Need permission="distribution.view"><DistributionHistoryPage /></Need> },
          { path: 'distribution/:date', element: <Need permission="distribution.view"><DistributionReportPage /></Need> },
          { path: 'seals', element: <Need permission="seals.manage"><SealLedger><Outlet /></SealLedger></Need>, children: [
            { index: true, element: <SealIssuePage /> },
            { path: 'recent', element: <SealRecentPage /> },
            { path: 'unrecorded', element: <SealUnrecordedPage /> },
            { path: 'log', element: <SealLogPage /> },
          ] },
          { path: 'attendance', element: <Need permission="attendance.view"><Board /></Need> },
          { path: 'generation', element: <Need permission="generation.view"><GenerationReportPage /></Need> },
          { path: 'generation/:date', element: <Need permission="generation.view"><GenerationReportPage /></Need> },
          { path: 'entry/:date', element: <Need permission="generation.fill"><GenerationEntryPage /></Need> },
          { path: 'sheet', element: <Need permission="distribution.fill"><DistributionEntryPage /></Need> },
          { path: 'sheet/:date', element: <Need permission="distribution.fill"><DistributionEntryPage /></Need> },
          { path: 'distribution/entry/:date', element: <Need permission="distribution.fill"><DistributionEntryPage /></Need> },
          { path: 'attendance/points', element: <Need permission="attendance.points"><Points /></Need> },
          { path: 'employees/:id', element: <EmployeeFile /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
