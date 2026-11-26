import { ClipboardList, Printer, QrCode, Settings2, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, ApiError } from '../api/client'
import { can, useUser } from '../app/auth'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner } from '../ui/Field'
import { Loading } from '../ui/PageHead'
import { Avatar } from '../ui/primitives'
import { useToast } from '../ui/Toast'
import { Users } from './Users'
import { BranchSetupCards, SoonCard } from './settings/BranchSetupCards'

type Tab = 'general' | 'permissions' | 'messages'

export function BranchSettings() {
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const canOpenPages = can(user, 'permissions.branch_manage')
  const requested = params.get('tab')
  const tab: Tab = requested === 'permissions' && canOpenPages ? 'permissions' : requested === 'messages' ? 'messages' : 'general'
  useDocumentTitle('الإعدادات')
  const tabs = [
    { key: 'general', label: 'الإعدادات' },
    ...(canOpenPages ? [{ key: 'permissions', label: 'الصلاحيات' }] : []),
    { key: 'messages', label: 'الرسائل' },
  ]

  return (
    <div className="settings af-branch-settings">
      <header className="ph">
        <div><h1>الإعدادات</h1><p className="muted">ما تضيفه هنا يظهر عند الجميع في فرع {user.branch?.name}. الإعدادات والصلاحيات يراها مدير الفرع فقط.</p></div>
      </header>
      <div className="segmented" role="radiogroup" aria-label="أقسام الإعدادات">
        {tabs.map(({ key, label }) => <button key={key} type="button" role="radio" aria-checked={tab === key}
          onClick={() => setParams(key === 'general' ? {} : { tab: key }, { replace: true })}>{label}</button>)}
      </div>
      {tab === 'general' && <>
        {can(user, 'users.view') && <section className="card"><Users embedded /></section>}
        <BranchSetupCards />
        <section className="card">
          <div className="card-h"><span className="ico-round brand"><Settings2 size={17} /></span><h2>الدوام والحضور والمهام</h2></div>
          <div className="rows">
            {user.branch && can(user, 'branches.view') && <Link className="row" to={`/branches/${user.branch.id}`}><UsersRound size={18} /> الدوامات وأقسام الفرع</Link>}
            {can(user, 'attendance.points') && <Link className="row" to="/attendance?tab=sheet"><QrCode size={18} /> ورقة الحضور وشبكة المكتب</Link>}
            {can(user, 'tasks.manage') && <Link className="row" to="/tasks/settings"><ClipboardList size={18} /> أنواع المهام والمناطق</Link>}
            {can(user, 'tasks.view') && <Link className="row" to="/tasks/daily"><Printer size={18} /> كشف إنجاز الفنيين</Link>}
          </div>
        </section>
        <SoonCard />
      </>}
      {tab === 'permissions' && <BranchPages />}
      {tab === 'messages' && <Link className="btn" to="/messages">فتح المراسلات</Link>}
    </div>
  )
}

interface BranchPagesData {
  pages: Array<{ key: string; label: string }>
  people: Array<{ id: number; name: string; username: string; pages: string[]; locked: Array<{ key: string; enabled: boolean }> }>
}

function BranchPages() {
  const { data, error, loading, setData } = useLoad<BranchPagesData>('/settings/branch/pages')
  const [saving, setSaving] = useState<number | null>(null)
  const toast = useToast()

  async function toggle(id: number, key: string, enabled: boolean) {
    setSaving(id)
    try {
      await api(`/settings/branch/users/${id}/page`, { method: 'PUT', body: { key, enabled } })
      setData((current) => current && {
        ...current,
        people: current.people.map((person) => person.id !== id ? person : {
          ...person, pages: enabled ? [...person.pages, key] : person.pages.filter((page) => page !== key),
        }),
      })
      toast(enabled ? 'فُتحت الصفحة للاطلاع' : 'أُغلقت الصفحة')
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'تعذّر حفظ الصلاحية.', 'danger')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-h"><span className="ico-round brand"><ShieldCheck size={16} /></span><h2>الصفحات المفتوحة لكل موظف</h2></div>
        <p className="card-empty">اضغط على اسم الصفحة لفتحها للاطلاع في هذا الفرع أو لإغلاقها. يُحفظ التغيير فورًا.</p>
      </section>
      <ErrorBanner text={error} />
      {loading && <Loading />}
      {data && !data.pages.length && <p className="card af-pad">لا توجد صفحات متاحة للتفويض.</p>}
      {data && <ul className="perm-cards">
        {data.people.map((person) => <li className="perm-card card" key={person.id}>
          <div className="perm-who"><Avatar name={person.name} size={40} /><span><b>{person.name}</b><small className="af-sub" dir="auto">@{person.username}</small></span></div>
          <div className="perm-pages" role="group" aria-label={`الصفحات المفتوحة لـ${person.name}`}>
            {data.pages.map((page) => {
              const locked = person.locked.find((override) => override.key === page.key)
              const enabled = locked?.enabled ?? person.pages.includes(page.key)
              return <button key={page.key} type="button" className="perm-chip" aria-pressed={enabled}
                disabled={saving !== null || !!locked} title={locked ? 'محددة من إعدادات الشركة' : undefined}
                onClick={() => void toggle(person.id, page.key, !enabled)}>{page.label}{locked && ' · من الإدارة'}</button>
            })}
          </div>
        </li>)}
      </ul>}
    </>
  )
}
