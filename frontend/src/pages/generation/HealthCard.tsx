import { Activity, ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { formatAmount } from '../../lib/numbers'
import { generatorHealth, type Trend } from './health'
import type { Generator, SiteReport } from './model'

/** How each generator does over the last weeks (burn per hour, temperature, oil pressure). */
export function HealthCard({ report, history, generators }: { report: SiteReport; history: SiteReport[]; generators: Generator[] }) {
  const rows = generatorHealth([report, ...history], generators)
  if (!rows.length) return null
  const worse = rows.filter((r) => r.burn?.trend === 'worse' || r.temp?.trend === 'worse' || r.oil?.trend === 'worse').length
  return (
    <section className="card health-card">
      <div className="card-h">
        <span className="ico-round"><Activity size={16} /></span>
        <h2>صحة المولدات</h2>
        <span className="meta">{worse ? `${worse} يحتاج متابعة` : 'آخر أسبوع مقابل الأسبوع الذي قبله'}</span>
      </div>
      <ul className="hc-list">
        {rows.map((r) => (
          <li key={r.generatorId}>
            <b className="hc-name">{r.name}</b>
            <Metric label="الصرف" unit="لتر/ساعة" m={r.burn} upIsBad empty={`لا توجد أيام كافية للحكم على الصرف (عمل منفرداً ${r.burnDaysAlone} ${r.burnDaysAlone === 1 ? 'يوماً' : 'أيام'}، ويلزم 4)`} sentence={r.burn ? (r.burn.trend === 'worse' ? 'أصبح يصرف أكثر' : r.burn.trend === 'better' ? 'أصبح يصرف أقل' : 'الصرف ثابت') + (r.burn.rated ? ` · المعدّل المكتوب ${formatAmount(r.burn.rated)}` : '') : ''} />
            <Metric label="الحرارة" unit="°م" m={r.temp} upIsBad empty="لا توجد قراءات حرارة كافية" sentence={r.temp ? (r.temp.trend === 'worse' ? 'حرارته ترتفع' : r.temp.trend === 'better' ? 'حرارته تنخفض' : 'حرارته ثابتة') : ''} />
            <Metric label="ضغط الزيت" unit="bar" m={r.oil} empty="لا توجد قراءات ضغط كافية" sentence={r.oil ? (r.oil.trend === 'worse' ? 'ضغط الزيت ينخفض' : r.oil.trend === 'better' ? 'ضغط الزيت يرتفع' : 'ضغط الزيت ثابت') : ''} />
          </li>
        ))}
      </ul>
      <p className="hc-note">يُحسب الصرف من الأيام التي عمل فيها المولد منفرداً فقط. المقارنة: آخر 7 أيام مقابل الأيام السبعة التي قبلها.</p>
    </section>
  )
}

function Metric({ label, unit, m, empty, sentence }: { label: string; unit: string; m: { now: number; before: number; trend: Trend } | null; empty: string; sentence: string; upIsBad?: boolean }) {
  if (!m) return <div className="hc-m off"><small>{label}</small><span>{empty}</span></div>
  const up = m.now > m.before
  const Icon = m.trend === 'same' ? Minus : up ? ArrowUp : ArrowDown
  return (
    <div className="hc-m" data-trend={m.trend}>
      <small>{label}</small>
      <span className="num"><b>{formatAmount(m.now)}</b> <i>{unit}</i> <Icon size={14} aria-hidden="true" /> <i>كان {formatAmount(m.before)}</i></span>
      <span className="hc-s">{sentence}</span>
    </div>
  )
}
