import { ArrowLeft, Moon, Plus, X } from 'lucide-react'
import { formatAmount } from '../../lib/numbers'
import { CalcField, Chip, Segmented, TimeField } from '../../ui/form'
import { BandGrid } from '../sheets/BandGrid'
import { bandAverage, bandsDayAverage, LOAD_UNIT_OPTIONS } from '../sheets/loads'
import { crossesMidnight, emptyZoneRun, MAX_ZONE_RUNS, RUN_NAMES, type DistributionSheet, type ZoneEntry } from './model'

type Update = (change: (sheet: DistributionSheet) => void) => void

export function ZoneStep({ entry, index, count, name, update }: { entry: ZoneEntry; index: number; count: number; name: string; update: Update }) {
  const set = (change: (z: ZoneEntry) => void) => update((s) => change(s.zones[index]!))
  return (
    <>
      <section className="fcard" data-off={!entry.supplied || undefined}>
        <header className="gen-head">
          <div>
            <h3 className="fcard-title">{name}</h3>
            <small className="muted num">المنطقة {index + 1} من {count}</small>
          </div>
          <Chip pressed={!entry.supplied} onClick={() => set((z) => (z.supplied = !z.supplied))}>
            <Moon size={15} /> لم تُغذَّ اليوم
          </Chip>
        </header>
        {entry.supplied && (
          <div className="zone-top">
            <CalcField label="عدد الساعات" unit="ساعة" value={entry.supplyHours} hint="يُحسب لحاله من أوقات التشغيلات" />
          </div>
        )}
      </section>

      {entry.supplied &&
        entry.runs.map((run, j) => (
          <section key={run.id} className="fcard zrun-card">
            <span className="run-label">
              التشغيلة {RUN_NAMES[j]}
              {entry.runs.length > 1 && (
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={`حذف التشغيلة ${RUN_NAMES[j]}`}
                  onClick={() =>
                    set((z) => {
                      z.runs.splice(j, 1)
                      z.runs.forEach((r, k) => (r.runNo = k + 1))
                    })
                  }
                >
                  <X size={16} />
                </button>
              )}
            </span>
            <div className="run-times">
              <TimeField label={`بداية التشغيلة ${RUN_NAMES[j]}`} value={run.start} onChange={(v) => set((z) => (z.runs[j]!.start = v))} />
              <ArrowLeft size={16} className="muted" aria-hidden="true" />
              <TimeField label={`نهاية التشغيلة ${RUN_NAMES[j]}`} value={run.end} onChange={(v) => set((z) => (z.runs[j]!.end = v))} />
            </div>
            {crossesMidnight(run) && <span className="next-day">حتى اليوم التالي</span>}
          </section>
        ))}

      {entry.supplied && entry.runs.length < MAX_ZONE_RUNS && (
        <button
          type="button"
          className="btn block dashed"
          onClick={() => set((z) => z.runs.push(emptyZoneRun(z.runs.length + 1, z.runs[z.runs.length - 1]?.loadUnit)))}
        >
          <Plus size={18} /> التشغيلة {RUN_NAMES[entry.runs.length]}
        </button>
      )}

      {entry.supplied && <ZoneLoads entry={entry} name={name} set={set} />}
    </>
  )
}

/** The paper's table for this zone: three readings in each hour band, with the mean of every hour and of the day. */
function ZoneLoads({ entry, name, set }: { entry: ZoneEntry; name: string; set: (change: (z: ZoneEntry) => void) => void }) {
  const unit = entry.runs[0]?.loadUnit ?? 'A'
  const day = bandsDayAverage(entry.bands)
  return (
    <section className="fcard zloads">
      <header className="gen-head zloads-head">
        <div>
          <h3 className="fcard-title">الأحمال حسب الساعة</h3>
          <small className="muted">Enter = اللي بعده · الأسهم للتنقل · الفاضي = شحطة</small>
        </div>
        <Segmented label="وحدة الأحمال" value={unit} options={LOAD_UNIT_OPTIONS} onChange={(v) => set((z) => z.runs.forEach((r) => (r.loadUnit = v)))} />
      </header>
      <BandGrid
        name={name}
        rows={3}
        unit={unit === 'A' ? 'أمبير' : 'كيلوواط'}
        max={unit === 'A' ? 2000 : 1000}
        values={entry.bands.map((b) => b)}
        average={entry.bands.map(bandAverage)}
        onChange={(b, r, v) => set((z) => void (z.bands[b]![r] = v))}
      />
      <div className="avg-line" aria-live="polite">
        <span>متوسط اليوم <small>(من الساعات اللي اكتملت قراءاتها الثلاثة)</small></span>
        <b className="num">{day === null ? '—' : `${formatAmount(day)} ${unit === 'A' ? 'أمبير' : 'كيلوواط'}`}</b>
      </div>
    </section>
  )
}
