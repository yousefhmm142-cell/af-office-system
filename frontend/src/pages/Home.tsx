import { Building2, KeyRound, Users } from 'lucide-react'
import { Link } from 'react-router'
import type { Branch, User } from '../api/types'
import { can, useUser } from '../app/auth'
import { firstName, formatLongDate, formatWeekday, greeting } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { PageHead } from '../ui/PageHead'
import { PunchCard } from './attendance/PunchCard'

export function Home() {
  const user = useUser()
  const branches = useLoad<{ branches: Branch[] }>(can(user, 'branches.view') ? '/branches' : null)
  const users = useLoad<{ users: User[] }>(can(user, 'users.view') ? '/users' : null)
  const now = new Date()
  const people = users.data?.users ?? []

  return (
    <div className="home">
      <PageHead title={`${greeting(now)}، ${firstName(user.name)}`} eyebrow={`${formatWeekday(now)} · ${formatLongDate(now)}`} />
      {user.branch && user.modules?.includes('attendance') && <PunchCard />}
      <div className="dash-kpis">
        {can(user, 'branches.view') && (
          <Link to="/branches" className="dash-kpi glass">
            <span className="dash-kpi-l"><Building2 size={16} /> الفروع</span>
            <span className="dash-kpi-n num">{branches.data?.branches.length ?? '…'}</span>
            <small>{branches.data ? `${branches.data.branches.filter((b) => b.is_active).length} فعّال` : ' '}</small>
          </Link>
        )}
        {can(user, 'users.view') && (
          <Link to="/users" className="dash-kpi glass" data-tone="ok">
            <span className="dash-kpi-l"><Users size={16} /> المستخدمين</span>
            <span className="dash-kpi-n num">{users.data ? people.length : '…'}</span>
            <small>{users.data ? `${people.filter((p) => !p.is_active).length} موقوف · ${people.filter((p) => p.must_change_password).length} ما دخلوا لسا` : ' '}</small>
          </Link>
        )}
        {can(user, 'permissions.manage') && (
          <Link to="/permissions" className="dash-kpi glass" data-tone="info">
            <span className="dash-kpi-l"><KeyRound size={16} /> الصلاحيات</span>
            <span className="dash-kpi-n">⚙</span>
            <small>مين بيشوف شو</small>
          </Link>
        )}
      </div>
      <section className="card glass af-pad">
        <h2 className="af-h2">شو في بالنظام لهلأ</h2>
        <p className="eyebrow">هلأ في: الفروع، والموظفين وملفاتهم، والصلاحيات، والحضور. باقي الأقسام (الرواتب، المراسلات، التوليد…) جاي بالمراحل الجاية.</p>
        <p className="eyebrow">حسابك: <b>{user.role?.name}</b>{user.branch ? <> · فرع <b>{user.branch.name}</b></> : <> · كل الفروع</>}</p>
      </section>
    </div>
  )
}
