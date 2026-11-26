import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouteError } from 'react-router'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Button } from '../ui/primitives'

/** Shown when a screen crashes, instead of a blank page (as in the office's old system). */
export function RouteError() {
  const error = useRouteError()
  const [reference] = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase())
  useDocumentTitle('حدث خطأ غير متوقع')
  useEffect(() => { console.error(`[${reference}]`, error) }, [error, reference])
  return (
    <div className="state-page">
      <div className="empty state-view">
        <span className="state-illustration" aria-hidden="true"><TriangleAlert size={28} /></span>
        <h3>حدث خطأ غير متوقع</h3>
        <p>بياناتك المحفوظة لم تتأثر. أعد تحميل الصفحة، وإن تكرر الخطأ فأخبر مدير الفرع أو مسؤول النظام.</p>
        <Button variant="primary" icon={<RefreshCw size={17} />} onClick={() => window.location.reload()}>إعادة التحميل</Button>
      </div>
      <p className="num">مرجع العطل: {reference}</p>
    </div>
  )
}
