import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import { Account } from '../pages/Account'
import { Audit } from '../pages/Audit'
import { Inbox } from '../pages/messages/Inbox'
import { DailyTasks } from '../pages/tasks/DailyTasks'
import { TasksBoard } from '../pages/tasks/Board'
import { LinkPage } from '../pages/tasks/LinkPage'
import { MyTasks } from '../pages/tasks/MyTasks'
import { TaskSettings } from '../pages/tasks/Settings'
import { BatchPage } from '../pages/payroll/BatchPage'
import { Extras } from '../pages/payroll/Extras'
import { MyPay } from '../pages/payroll/MyPay'
import { PayrollHome } from '../pages/payroll/PayrollHome'
import { PayrollSettings } from '../pages/payroll/SettingsPage'
import { Board } from '../pages/attendance/Board'
import { MyAttendance } from '../pages/attendance/MyAttendance'
import { Points } from '../pages/attendance/Points'
import { Scan } from '../pages/attendance/Scan'
import { BranchDetail } from '../pages/BranchDetail'
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
          { path: 'permissions', element: <Need permission="permissions.manage"><Permissions /></Need> },
          { path: 'audit', element: <Need permission="audit.view"><Audit /></Need> },
          { path: 'account', element: <Account /> },
          { path: 'me', element: <EmployeeFile /> },
          { path: 'attendance/me', element: <MyAttendance /> },
          { path: 'my-tasks', element: <MyTasks /> },
          { path: 'tasks', element: <NeedAny permissions={['tasks.view', 'tasks.manage']}><TasksBoard /></NeedAny> },
          { path: 'tasks/daily', element: <NeedAny permissions={['tasks.view', 'tasks.manage']}><DailyTasks /></NeedAny> },
          { path: 'tasks/settings', element: <Need permission="tasks.manage"><TaskSettings /></Need> },
          { path: 'messages', element: <Inbox /> },
          { path: 'messages/:id', element: <Inbox /> },
          { path: 'my-pay', element: <MyPay /> },
          { path: 'payroll', element: <NeedAny permissions={['payroll.view', 'payroll.manage']}><PayrollHome /></NeedAny> },
          { path: 'payroll/extras', element: <Need permission="payroll.manage"><Extras /></Need> },
          { path: 'payroll/settings', element: <Need permission="payroll.manage"><PayrollSettings /></Need> },
          { path: 'payroll/:id', element: <NeedAny permissions={['payroll.view', 'payroll.manage']}><BatchPage /></NeedAny> },
          { path: 'attendance', element: <Need permission="attendance.view"><Board /></Need> },
          { path: 'attendance/points', element: <Need permission="attendance.points"><Points /></Need> },
          { path: 'employees/:id', element: <EmployeeFile /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
