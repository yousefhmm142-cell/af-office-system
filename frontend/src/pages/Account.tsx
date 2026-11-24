import { LogOut } from 'lucide-react'
import { useAuth, useUser } from '../app/auth'
import { useConfirm } from '../ui/Confirm'
import { PageHead } from '../ui/PageHead'
import { Avatar, Button } from '../ui/primitives'
import { ChangePasswordForm } from './ChangePassword'

export function Account() {
  const user = useUser()
  const { signOut } = useAuth()
  const confirm = useConfirm()
  return (
    <>
      <PageHead title="حسابي" />
      <div className="af-grid2">
        <section className="card glass af-pad">
          <div className="af-card-top">
            <Avatar name={user.name} size={56} />
            <div>
              <b style={{ fontSize: '1.2rem' }}>{user.name}</b>
              <p className="eyebrow" dir="auto">@{user.username}</p>
            </div>
          </div>
          <div className="rows" style={{ marginTop: 12 }}>
            <div className="row"><span className="row-label">الدور</span><span className="row-value">{user.role?.name}</span></div>
            <div className="row"><span className="row-label">الفرع</span><span className="row-value">{user.branch?.name ?? 'كل الفروع'}</span></div>
          </div>
          <Button icon={<LogOut size={16} />} onClick={async () => { if (await confirm({ title: 'تسجيل الخروج؟', confirmLabel: 'خروج' })) await signOut() }} style={{ marginTop: 12 }}>تسجيل الخروج</Button>
        </section>
        <section className="card glass af-pad">
          <h2 className="af-h2">تغيير الرمز</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  )
}
