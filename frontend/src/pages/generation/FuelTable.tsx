import { Droplet } from 'lucide-react'
import { formatAmount } from '../../lib/numbers'
import type { FuelType, SiteReport } from './model'

export function FuelTable({ report, fuelTypes }: { report: SiteReport; fuelTypes: FuelType[] }) {
  return (
    <section className="card">
      <div className="card-h"><span className="ico-round"><Droplet size={16} /></span><h2>المحروقات</h2><span className="meta">باللتر</span></div>
      <div className="tw">
        <table className="tbl">
          <thead>
            <tr><th>نوع الوقود</th><th>الرصيد الموجود</th><th>الكمية الواردة</th><th>المجموع</th><th>الرصيد المتبقي</th><th>الاستهلاك</th><th>رقم الإرسالية</th><th>المورّد</th><th>ملاحظات</th></tr>
          </thead>
          <tbody>
            {report.fuel.map((f, i) => (
              <tr key={f.id}>
                <td><span className="fuel-name"><span className={`fuel-dot ${i === 0 ? '' : 'chrome'}`} />{fuelTypes.find((t) => t.id === f.fuelTypeId)?.name}</span></td>
                <td className="n">{formatAmount(f.openingBalance)}</td>
                <td className="n">{formatAmount(f.receivedQty)}</td>
                <td className="n">{formatAmount(f.totalQty)}</td>
                <td className="n em">{formatAmount(f.closingBalance)}</td>
                <td className="n em">{formatAmount(f.consumption)}</td>
                <td className="n">{f.shipmentNo || '—'}</td>
                <td>{f.supplier?.trim() ? <>{f.supplier}{f.unitPrice != null && <small className="muted num"> · {formatAmount(f.unitPrice)} ₪/لتر</small>}</> : '—'}</td>
                <td className="muted">{f.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
