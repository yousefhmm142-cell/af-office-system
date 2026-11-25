import { PencilLine, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api/client'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ErrorBanner } from '../../ui/Field'
import { Skeleton } from '../../ui/fx/Skeleton'
import { BackButton, DateNav, NoSheet, StatusBar } from './ReportControls'
import { isEditableStatus, type SheetMeta } from './workflow'

export function ReportPage({ module, title, subtitle, source, icon: Icon, noun, date, entry, latest, sheet, canFill, canApprove, error, loading, onReload, extraActions, children }: {
  module: 'generation' | 'distribution'; title: string; subtitle: string; source: string
  icon: LucideIcon; noun: 'التقرير' | 'الكشف'; date: string; entry: string; latest: string
  sheet: SheetMeta & { version: number } | null; canFill: boolean; canApprove: boolean
  error: string | null; loading: boolean; onReload(): Promise<void>; extraActions?: ReactNode; children?: ReactNode
}) {
  const navigate = useNavigate()
  useDocumentTitle(title)
  const editable = !sheet || isEditableStatus(sheet.status)
  async function transition(action: 'approve' | 'return', reason?: string) {
    if (!sheet) return
    await api(`/${module}/${date}/${action}`, { method: 'POST', body: { version: sheet.version, reason } })
    await onReload()
  }

  return <div className="gen-page">
    <div className="report-page">
      <BackButton fallback="/" />
      <header className="ph">
        <div><div className="eyebrow"><Icon size={14} /> {subtitle}</div><h1>{title}</h1></div>
        <div className="ph-actions">
          {canFill && (editable || canApprove) && <Link to={entry} className={`btn fill-btn${editable ? ' primary' : ''}`}>
            <PencilLine size={17} /> {!sheet ? `تعبئة ${noun}` : editable ? `متابعة تعبئة ${noun}` : `تعديل ${noun}`}
          </Link>}
          <DateNav date={date} onChange={(value) => navigate(`/${module}/${value}`)} />
        </div>
      </header>
      <ErrorBanner text={error} />
      {loading && !sheet && !error ? <Skeleton kind="cards" /> : sheet ? <>
        <StatusBar sheet={sheet} source={source} canAct={canApprove} extraActions={extraActions}
          returnPlaceholder={module === 'generation' ? 'مثال: الرصيد الموجود لا يطابق متبقي أمس' : 'مثال: أحمال التشغيلة الثانية تحتاج مراجعة'}
          onApprove={() => transition('approve')} onReturn={(reason) => transition('return', reason)} />
        {children}
      </> : !error && <NoSheet date={date} drafting={false} noun={noun} source={source} listHref={latest} />}
    </div>
  </div>
}
