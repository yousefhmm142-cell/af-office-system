import { formatAmount } from '../../lib/numbers'
import { advanceOnEnter, Segmented } from '../../ui/form'
import { BandGrid } from '../sheets/BandGrid'
import { GENERATION_BANDS, LOAD_UNIT_OPTIONS, readBandValues, valuesDayAverage, type LoadUnit } from '../sheets/loads'

export interface GeneratorLoad {
  generator_id: number
  name: string
  brand: string
  capacity_kva: number | null
  load_unit: LoadUnit
  band_loads: (number | null)[]
}

export function GeneratorLoadsPanel({ readings, onChange }: {
  readings: GeneratorLoad[]
  onChange?: (id: number, changes: Record<number, number | null>, unit?: LoadUnit) => void
}) {
  return <section id="generator-loads" className="distribution-generator-loads" onKeyDown={advanceOnEnter} aria-label="أحمال المولدات اليومية">
    <header><h2>أحمال المولدات</h2><p className="muted">تعبئة واحدة لليوم كله، وبتظهر في تقرير التوليد أيضًا.</p></header>
    {readings.length === 0 ? <p className="muted">ما في مولدات مسجّلة لهذا اليوم.</p> : readings.map((row) =>
      <fieldset key={row.generator_id} className="fcard gloads" disabled={!onChange}>
        <header className="gen-head zloads-head">
          <div><h3 className="fcard-title">{row.name}</h3><small className="muted">{row.brand}{row.capacity_kva ? ` · ${formatAmount(row.capacity_kva)} kVA` : ''}</small></div>
          <Segmented label={`وحدة أحمال ${row.name}`} value={row.load_unit} options={LOAD_UNIT_OPTIONS} onChange={(unit) => onChange?.(row.generator_id, {}, unit)} />
        </header>
        <BandGrid bands={GENERATION_BANDS} name={row.name} rows={1} values={readBandValues(row.band_loads).map((value) => [value])}
          max={row.load_unit === 'A' ? 5000 : 2000} onChange={(band, _, value) => onChange?.(row.generator_id, { [band]: value })} />
        <div className="avg-line"><span>متوسط الساعات المكتوبة</span><b className="num">{valuesDayAverage(row.band_loads) === null
          ? '—' : `${formatAmount(valuesDayAverage(row.band_loads))} ${row.load_unit === 'A' ? 'أمبير' : 'كيلوواط'}`}</b></div>
      </fieldset>,
    )}
  </section>
}
