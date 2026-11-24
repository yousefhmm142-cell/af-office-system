import { AlarmClock, CalendarX2, Clock4, Save } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../../api/client'
import type { Branch } from '../../api/types'
import { scopeOf, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import type { Mode, Setting } from './lib'

const todayGaza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date())

/** Three cards, each with a sentence that says exactly what will happen. */
export function PayrollSettings() {
  const me = useUser()
  const toast = useToast()
  const all = scopeOf(me, 'payroll.manage') === 'all'
  const branches = useLoad<{ branches: Branch[] }>(all ? '/branches' : null)
  const [branchId, setBranchId] = useState('')
  const { data, loading, reload } = useLoad<{ settings: Setting[]; current: Setting }>(`/payroll/settings${branchId ? `?branch_id=${branchId}` : ''}`)
  const [s, setS] = useState<Setting | null>(null)
  const [from, setFrom] = useState(todayGaza)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (data) setS({ ...data.current, overtime_cap_hours: data.current.overtime_cap_hours ?? null }) }, [data])
  if (loading && !data) return <Loading />
  if (!s) return null
  const set = <K extends keyof Setting>(k: K, v: Setting[K]) => setS({ ...s, [k]: v })

  async function save() {
    setBusy(true); setError(null)
    try {
      await api('/payroll/settings', { method: 'POST', body: { ...s, branch_id: branchId ? Number(branchId) : null, effective_from: from } })
      toast('حُفظت القواعد')
      void reload()
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <PageHead title="قواعد حساب الرواتب" eyebrow="أنت من يحدد القواعد، والنظام يحسب على أساسها" />
      {all && (
        <div className="chips af-pad0">
          <button type="button" className="chip" aria-pressed={branchId === ''} onClick={() => setBranchId('')}>جميع الفروع (الافتراضي)</button>
          {branches.data?.branches.map((b) => <button key={b.id} type="button" className="chip" aria-pressed={branchId === String(b.id)} onClick={() => setBranchId(String(b.id))}>{b.name}</button>)}
        </div>
      )}
      <div className="af-rules">
        <Rule icon={<AlarmClock size={22} />} title="خصم التأخير" mode={s.late_mode} value={s.late_value}
          onMode={(m) => set('late_mode', m)} onValue={(v) => set('late_value', v)}
          wageLabel="معامل أجر الساعة" fixedLabel="المبلغ عن كل ساعة تأخير"
          sentence={s.late_mode === 'none' ? 'لا يُخصم شيء على التأخير.' : s.late_mode === 'wage' ? `كل ساعة تأخير (بعد دقائق السماح) تُخصم بأجر ساعة × ${s.late_value}.` : `كل ساعة تأخير تُخصم ${s.late_value} شيكل، وتُحسب الدقائق بنسبتها.`} />
        <Rule icon={<CalendarX2 size={22} />} title="خصم الغياب" mode={s.absence_mode} value={s.absence_value}
          onMode={(m) => set('absence_mode', m)} onValue={(v) => set('absence_value', v)}
          wageLabel="معامل أجر اليوم" fixedLabel="المبلغ عن كل يوم غياب"
          sentence={s.absence_mode === 'none' ? 'لا يُخصم شيء على الغياب.' : s.absence_mode === 'wage' ? `كل يوم غياب يُخصم بأجر يوم × ${s.absence_value}. (لأصحاب الراتب الشهري؛ اليومية والأسبوعي يُدفعان عن أيام الحضور فقط.)` : `كل يوم غياب يُخصم ${s.absence_value} شيكل.`} />
        <Rule icon={<Clock4 size={22} />} title="الوقت الإضافي" mode={s.overtime_mode} value={s.overtime_value}
          onMode={(m) => set('overtime_mode', m)} onValue={(v) => set('overtime_value', v)}
          wageLabel="معامل أجر الساعة" fixedLabel="المبلغ عن كل ساعة إضافية"
          sentence={s.overtime_mode === 'none' ? 'لا يُحسب الوقت الإضافي.' : s.overtime_mode === 'wage' ? `كل ساعة إضافية تُضاف بأجر ساعة × ${s.overtime_value}.` : `كل ساعة إضافية تُضاف ${s.overtime_value} شيكل.`}>
          {s.overtime_mode !== 'none' && (
            <label className="af-inline">حد أعلى بالشهر (ساعات، اختياري)
              <input className="input num" inputMode="numeric" dir="ltr" value={s.overtime_cap_hours ?? ''} onChange={(e) => set('overtime_cap_hours', e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')))} />
            </label>
          )}
        </Rule>
      </div>
      <section className="card glass af-pad af-save-bar">
        <label className="af-inline">تسري القواعد من تاريخ
          <input className="input num" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <p className="eyebrow">لا تغيّر القواعد الجديدة الدفعات المعتمدة قبل هذا التاريخ.</p>
        <ErrorBanner text={error} />
        <Button variant="primary" size="lg" icon={<Save size={18} />} busy={busy} onClick={() => void save()}>حفظ القواعد</Button>
      </section>
      {(data?.settings.length ?? 0) > 0 && (
        <section className="card glass af-pad" style={{ marginTop: 16 }}>
          <h2 className="af-h2">سجل القواعد</h2>
          <div className="rows">
            {data!.settings.map((r) => (
              <div key={r.id} className="row af-kv">
                <span className="row-label">من {r.effective_from}{r.branch_id ? ' · فرع' : ' · الافتراضي'}</span>
                <span className="row-value">تأخير: {label(r.late_mode)} · غياب: {label(r.absence_mode)} · إضافي: {label(r.overtime_mode)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

const label = (m: Mode) => (m === 'none' ? 'لا' : m === 'wage' ? 'حسب الأجر' : 'مبلغ ثابت')

function Rule({ icon, title, mode, value, onMode, onValue, wageLabel, fixedLabel, sentence, children }: {
  icon: ReactNode; title: string; mode: Mode; value: number; onMode(m: Mode): void; onValue(v: number): void
  wageLabel: string; fixedLabel: string; sentence: string; children?: ReactNode
}) {
  return (
    <section className="card glass af-pad af-rule" data-on={mode !== 'none' || undefined}>
      <h2 className="af-h2"><span className="af-tile-ico">{icon}</span> {title}</h2>
      <div className="segmented" role="radiogroup" aria-label={title}>
        <button type="button" role="radio" aria-checked={mode === 'none'} onClick={() => onMode('none')}>لا يُحسب</button>
        <button type="button" role="radio" aria-checked={mode === 'wage'} onClick={() => onMode('wage')}>حسب الأجر</button>
        <button type="button" role="radio" aria-checked={mode === 'fixed'} onClick={() => onMode('fixed')}>مبلغ ثابت</button>
      </div>
      {mode !== 'none' && (
        <label className="af-inline">{mode === 'wage' ? wageLabel : fixedLabel}
          <input className="input num af-big-input" inputMode="decimal" dir="ltr" value={value} onChange={(e) => onValue(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
        </label>
      )}
      {children}
      <p className="af-sentence">{sentence}</p>
    </section>
  )
}
