import { ChevronLeft, ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { dayName, describeDay, todayISO, type ISODate } from '../../lib/dates'
import { EmptyArt } from '../../ui/fx/EmptyArt'
import { Skeleton } from '../../ui/fx/Skeleton'
import { Pill } from '../../ui/primitives'
import { statusInfo, type SheetStatus } from './workflow'

export interface HistoryItem {
  id: string
  date: ISODate
  status: SheetStatus
  figures: ReactNode
  href: string
}

/** Earlier days for the person who fills the form, newest first, with a shortcut to today's. */
export function SheetHistory({ title, items, todayMissing, todayLabel, todayHref = '/', emptyText, chart }: {
  title: string
  /** A chart above the list (the generation history shows its diesel use). */
  chart?: ReactNode
  /** Where today's form is filled. */
  todayHref?: string
  items: HistoryItem[] | undefined
  todayMissing: boolean
  todayLabel: string
  emptyText: string
}) {
  const today = todayISO()
  return (
    <div className="history">
      <header className="ph">
        <div>
          <h1>{title}</h1>
          <p className="muted">اضغط أي يوم لعرضه كما وصل للمدير.</p>
        </div>
      </header>
      {todayMissing && (
        <Link to={todayHref} className="cta glass">
          <span className="cta-ico"><ClipboardList size={22} /></span>
          <span><b>{todayLabel} لم يبدأ بعد</b><small>ابدأ التعبئة الآن</small></span>
          <ChevronLeft size={20} />
        </Link>
      )}
      {chart}
      {!items ? (
        <Skeleton kind="list" />
      ) : items.length === 0 ? (
        <div className="empty card"><EmptyArt kind="clipboard" /><h3>لا شيء بعد</h3><p>{emptyText}</p></div>
      ) : (
        <ul className="history-list">
          {items.map((it) => (
            <li key={it.id}>
              <Link to={it.href} className="history-item card">
                <span className="history-day">
                  <b>{dayName(it.date, today)}</b>
                  <small className="num">{describeDay(it.date).date}</small>
                </span>
                <span className="history-figures num">{it.figures}</span>
                <Pill tone={statusInfo[it.status].tone}>{statusInfo[it.status].label}</Pill>
                <ChevronLeft size={18} className="muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
