import { Clock4, History, Minus, Save } from 'lucide-react'
import { Link } from 'react-router'
import { NxCard } from '../../ui/nx'
import { Crumbs } from '../../ui/Crumbs'
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
      await api('/payroll/settings', { method: 'POST', body: { ...s, late_mode: 'none', absence_mode: 'none', branch_id: branchId ? Number(branchId) : null, effective_from: from } })
      toast('حُفظت القواعد')
      void reload()
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'حدث خطأ.')
    } finally { setBusy(false) }
  }

  return (
    <div className="nx nxs">
      <Crumbs trail={[{ label: 'الرواتب', to: '/payroll' }, { label: 'قواعد الحساب' }]} />
      <PageHead title="قواعد حساب الرواتب" eyebrow="أنت من يحدد القواعد، والنظام يحسب على أساسها" />
      {all && (
        <div className="nxw-chips nxs-branches">
          <button type="button" className="nxw-chip" aria-pressed={branchId === ''} onClick={() => setBranchId('')}>جميع الفروع (الافتراضي)</button>
          {branches.data?.branches.map((b) => <button key={b.id} type="button" className="nxw-chip" aria-pressed={branchId === String(b.id)} onClick={() => setBranchId(String(b.id))}>{b.name}</button>)}
        </div>
      )}
      <div className="nx-split nx-split-even">
        <Rule icon={<Clock4 size={20} />} title="الوقت الإضافي" mode={s.overtime_mode} value={s.overtime_value}
          onMode={(m) => set('overtime_mode', m)} onValue={(v) => set('overtime_value', v)}
          wageLabel="معامل أجر الساعة" fixedLabel="المبلغ عن كل ساعة إضافية (₪)"
          sentence={s.overtime_mode === 'none' ? 'لا يُحسب الوقت الإضافي.' : s.overtime_mode === 'wage' ? `كل ساعة إضافية تُضاف بأجر ساعة × ${s.overtime_value}.` : `كل ساعة إضافية تُضاف ${s.overtime_value} شيكل.`}>
          {s.overtime_mode !== 'none' && (
            <label className="field"><span className="label">حد أعلى بالشهر (ساعات، اختياري)</span>
              <input className="input num" inputMode="numeric" dir="ltr" placeholder="بلا حد" value={s.overtime_cap_hours ?? ''} onChange={(e) => set('overtime_cap_hours', e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')))} />
            </label>
          )}
        </Rule>
        <div className="nx-stack">
          <NxCard title="الخصومات" icon={<Minus size={17} />}>
            <p className="nx-note">لا يخصم النظام تلقائياً عن التأخير أو الغياب. تُسجّل شؤون الموظفين أي خصم يدوياً مع المبلغ والسبب من <Link to="/payroll/extras">الخصومات والمكافآت</Link>.</p>
          </NxCard>
          <NxCard title="الحفظ" icon={<Save size={17} />}>
            <label className="field"><span className="label">تسري القواعد من تاريخ</span>
              <input className="input num" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <p className="nxw-hint">لا تغيّر القواعد الجديدة الدفعات المعتمدة قبل هذا التاريخ.</p>
            <ErrorBanner text={error} />
            <Button variant="primary" size="lg" icon={<Save size={18} />} busy={busy} onClick={() => void save()}>حفظ القواعد</Button>
          </NxCard>
        </div>
      </div>
      {(data?.settings.length ?? 0) > 0 && (
        <NxCard title="سجل القواعد" icon={<History size={17} />}>
          <ol className="nx-timeline">
            {data!.settings.map((r) => (
              <li key={r.id}><b>من {r.effective_from} · {r.branch_id ? 'فرع' : 'الافتراضي لجميع الفروع'}</b>
                <small>الوقت الإضافي: {label(r.overtime_mode)}{r.overtime_mode !== 'none' ? ` (${r.overtime_value})` : ''}</small></li>
            ))}
          </ol>
        </NxCard>
      )}
    </div>
  )
}

const label = (m: Mode) => (m === 'none' ? 'لا' : m === 'wage' ? 'حسب الأجر' : 'مبلغ ثابت')

function Rule({ icon, title, mode, value, onMode, onValue, wageLabel, fixedLabel, sentence, children }: {
  icon: ReactNode; title: string; mode: Mode; value: number; onMode(m: Mode): void; onValue(v: number): void
  wageLabel: string; fixedLabel: string; sentence: string; children?: ReactNode
}) {
  return (
    <section className="nx-card nxs-rule" data-on={mode !== 'none' || undefined}>
      <header className="nx-card-head"><h3><span className="nx-card-ico">{icon}</span>{title}</h3></header>
      <div className="nxw-pcts nxs-modes" role="radiogroup" aria-label={title}>
        {([['none', 'لا يُحسب', 'لا يدخل الراتب'], ['wage', 'حسب الأجر', 'أجر الساعة × معامل'], ['fixed', 'مبلغ ثابت', 'عن كل ساعة']] as const).map(([k, t, d]) => (
          <button key={k} type="button" role="radio" className="nxw-pct" aria-pressed={mode === k} aria-checked={mode === k} onClick={() => onMode(k)}><b>{t}</b><small>{d}</small></button>
        ))}
      </div>
      {mode !== 'none' && (
        <label className="field"><span className="label">{mode === 'wage' ? wageLabel : fixedLabel}</span>
          <input className="input num nxs-big" inputMode="decimal" dir="ltr" value={value} onChange={(e) => onValue(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
        </label>
      )}
      {children}
      <p className="nxw-note" data-hue={mode === 'none' ? 'slate' : 'mint'}><Clock4 size={17} /> {sentence}</p>
    </section>
  )
}
