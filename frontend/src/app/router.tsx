import { Navigate, Outlet, createBrowserRouter } from 'react-router'
import { Account } from '../pages/Account'
import { Audit } from '../pages/Audit'
import { BranchDetail } from '../pages/BranchDetail'
import { Branches } from '../pages/Branches'
import { ForcedPasswordChange } from '../pages/ChangePassword'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Permissions } from '../pages/Permissions'
import { Users } from '../pages/Users'
import { AppShell } from './AppShell'
import { can, useAuth, useUser } from './auth'

function Splash() {
  return <div className="splash" role="status" aria-label="بيحمّل"><span className="spinner" aria-hidden="true" /></div>
}

/** Signed out → login (or first setup); temporary password → choose your own first. */
function Gate() {
  const { state } = useAuth()
  if (state.status === 'loading') return <Splash />
  if (state.status !== 'signed_in') return <Login />
  if (state.user.must_change_password) return <ForcedPasswordChange />
  return <Outlet />
}

function Need({ permission, children }: { permission: string; children: React.ReactNode }) {
  const user = useUser()
  return can(user, permission) ? <>{children}</> : <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  {
    element: <Gate />,
    children: [
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
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
