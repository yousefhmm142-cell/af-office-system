import { salaryLabel } from '../api/types'
import { ChoiceField } from '../ui/ChoiceField'
import { EmployeeBody, type EmpTab } from './EmployeeOverview'
import { Crumbs } from '../ui/Crumbs'
import { NxAvatar, NxCard, NxEmpty, NxTabs, type Hue } from '../ui/nx'
import { Briefcase, Building2, CalendarDays, Clock3, FileText, Gauge, GraduationCap, History, IdCard, MapPin, Phone, Image as ImageIcon, LayoutGrid, Palmtree, Paperclip, Pencil, Trash2, Upload, UserRound, Wallet } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, openFile } from '../api/client'
import {
  ATTACHMENT_TYPES, EDUCATION, SALARY_TYPES, STATUS_LABEL,
  type EmployeeFile as File_, type EmployeeStatus, type Schedule,
} from '../api/types'
import { can, useAuth, useUser } from '../app/auth'
import { formatLongDate } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'

const label = (list: Array<[string, string]>, v: string | null | undefined) => list.find(([k]) => k === v)?.[1] ?? '—'
const STATUS_HUE: Record<EmployeeStatus, Hue> = { active: 'mint', trainee: 'sky', suspended: 'amber', terminated: 'rose' }

/** /employees/:id, or the signed-in person's own file when no id is given. */
export function EmployeeFile() {
  const me = useUser()
  const params = useParams()
  const navigate = useNavigate()
  const id = params.id ?? String(me.id)
  const { data, error, loading, setData } = useLoad<File_>(`/employees/${id}`)
  const toast = useToast()
  const [allowance,setAllowance] = useState('')
  const [year,setYear] = useState(String(new Date().getFullYear()))
  const [uploading,setUploading] = useState(false)
  const [search, setSearch] = useSearchParams()
  const tab = (search.get('tab') as EmpTab | null) ?? 'overview'
  const setTab = (t: EmpTab) => setSearch(t === 'overview' ? {} : { tab: t }, { replace: true })
  const [edit, setEdit] = useState<'personal' | 'wallet' | 'job' | 'status' | null>(null)

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const f = data
  const p = f.personal
  const mine = f.user.id === me.id

  if (mine && f.user.needs_profile_completion) {
    return (
      <>
        <PageHead title="استكمال الملف الشخصي" eyebrow="أدخل بياناتك الشخصية للبدء في استخدام النظام." />
        <div className="af-onboard-layout">
          <PersonalDialog file={f} part="personal" onClose={() => {}} onSaved={(updated) => { setData(updated); navigate('/', { replace: true }) }} onboarding uploading={uploading} documents={<Attachments file={f} onboarding onBusy={setUploading} onChange={attachments=>setData({...f,attachments})}/>}/>
        </div>
      </>
    )
  }

  const leaveForm = can(me, 'leaves.decide') && !mine && <form className="nx-inline-form" onSubmit={async e=>{
    e.preventDefault()
    try { await api(`/employees/${id}/leave-allowance`,{method:'PUT',body:{year:Number(year),days:Number(allowance)}})
      setData(await api<File_>(`/employees/${id}`)); setAllowance(''); toast('حُفظ الرصيد')
    } catch(err) { toast(err instanceof ApiError ? err.message : 'تعذّر الحفظ','danger') }
  }}><span className="nx-inline-t">تحديد الرصيد</span>
    <input className="input num" type="number" min="2000" max="2100" required value={year} onChange={e=>setYear(e.target.value)} aria-label="السنة" />
    <input className="input num" type="number" min="0" max="366" required value={allowance} onChange={e=>setAllowance(e.target.value)} placeholder="عدد الأيام" aria-label="أيام الإجازة السنوية" />
    <Button type="submit" className="sm">حفظ</Button></form>

  const leave = f.annual_leave
  const left = leave.days === null ? null : Math.max(0, leave.days - leave.used)
  const tabs: Array<{ key: EmpTab; label: string; icon: ReactNode; count?: number }> = [
    { key: 'overview', label: 'نظرة عامة', icon: <LayoutGrid size={16} /> },
    { key: 'attendance', label: 'الحضور', icon: <CalendarDays size={16} /> },
    { key: 'pay', label: 'الراتب', icon: <Wallet size={16} /> },
    { key: 'profile', label: 'البيانات', icon: <UserRound size={16} /> },
    { key: 'documents', label: 'المرفقات', icon: <Paperclip size={16} />, count: f.attachments.length },
    ...(f.job.tracks_attendance ? [{ key: 'performance' as const, label: 'الأداء الميداني', icon: <Gauge size={16} /> }] : []),
  ]
  const editBtn = (what: 'personal' | 'wallet' | 'job', text: string) => <button type="button" className="nx-edit" onClick={() => setEdit(what)} aria-label={text}><Pencil size={15} /> تعديل</button>

  const profile = (
    <div className="nx-split nx-split-even">
      <NxCard title="البيانات الشخصية" icon={<UserRound size={17} />} action={f.can.edit_personal && editBtn('personal', 'تعديل البيانات الشخصية')}>
        <dl className="nx-info">
          <Info k="الاسم الكامل" v={f.user.name} wide />
          <Info k="رقم الهوية" v={p.national_id} num />
          <Info k="رقم الجوال" v={p.phone} num />
          <Info k="مكان السكن" v={p.address} />
          <Info k="الجنس" v={p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : null} />
          <Info k="آخر مؤهل" v={label(EDUCATION, p.education_level)} />
          <Info k="التخصص" v={p.specialty} />
        </dl>
      </NxCard>
      <div className="nx-stack">
        <NxCard title="العمل والأجر" icon={<Briefcase size={17} />} action={f.can.edit_job && editBtn('job', 'تعديل العمل والأجر')}>
          <dl className="nx-info">
            <Info k="المسمى الوظيفي" v={f.job.job_title} />
            <Info k="القسم" v={f.job.department?.name} />
            <Info k="نوع الأجر" v={label(SALARY_TYPES, f.job.salary_type)} />
            <Info k="المبلغ" v={f.job.salary_amount ? `${Number(f.job.salary_amount)} ₪` : null} num />
            <Info k="تاريخ التوظيف" v={f.job.hire_date} num />
            <Info k="الدوام" v={`${f.job.schedule?.name ?? 'الأساسي للفرع'} · ${Number(f.job.daily_hours)} ساعات`} />
          </dl>
        </NxCard>
        <NxCard title={p.payment_method === 'bank' ? 'الحساب البنكي' : 'المحفظة'} icon={<Wallet size={17} />} action={f.can.edit_personal && editBtn('wallet', 'تعديل المحفظة')}>
          <div className="nx-paycard">
            <span className="nx-paycard-top"><b>{p.provider || (p.payment_method === 'bank' ? 'بنك' : 'محفظة')}</b><Wallet size={20} /></span>
            <span className="nx-paycard-no num" dir="ltr">{p.account_number || '— — — —'}</span>
            <span className="nx-paycard-bottom"><span><small>صاحب الحساب</small>{p.account_holder_name || '—'}</span><span><small>رقم الهوية</small><span className="num">{p.account_holder_national_id || '—'}</span></span></span>
          </div>
        </NxCard>
        {f.status_log.length > 0 && <NxCard title="سجل الحالة" icon={<History size={17} />}>
          <ol className="nx-timeline">{f.status_log.map((l, i) => <li key={i}>
            <b>{l.from ? `${STATUS_LABEL[l.from as EmployeeStatus]} ← ` : ''}{STATUS_LABEL[l.to]}</b>
            <small>{formatLongDate(new Date(l.at))} · {l.by ?? '—'}{l.reason ? ` · ${l.reason}` : ''}</small>
          </li>)}</ol>
        </NxCard>}
      </div>
    </div>
  )

  const personalCard = (
    <NxCard title="البيانات الشخصية" icon={<UserRound size={17} />} action={<button type="button" className="nx-edit" onClick={() => setTab('profile')}>الكل</button>}>
      <ul className="nx-plist">
        <PItem icon={<UserRound size={17} />} hue="violet" k="الجنس" v={p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : null} />
        <PItem icon={<IdCard size={17} />} hue="rose" k="رقم الهوية" v={p.national_id} num />
        <PItem icon={<Phone size={17} />} hue="mint" k="رقم الجوال" v={p.phone} num />
        <PItem icon={<MapPin size={17} />} hue="amber" k="مكان السكن" v={p.address} />
        <PItem icon={<GraduationCap size={17} />} hue="sky" k="المؤهل والتخصص" v={[p.education_level ? label(EDUCATION, p.education_level) : null, p.specialty].filter(Boolean).join(' · ') || null} />
        <PItem icon={<CalendarDays size={17} />} hue="violet" k="تاريخ التوظيف" v={f.job.hire_date} num />
      </ul>
    </NxCard>
  )

  const leaveCard = (
    <NxCard title={<>الإجازة السنوية <span className="num nx-muted">{leave.year}</span></>} icon={<Palmtree size={17} />}>
      <div className="nx-leave">
        <div className="nx-leave-big">{left !== null && <strong className="num">{left}</strong>}<span>{left === null ? 'لم يُحدَّد الرصيد بعد' : 'يوماً متبقية'}</span></div>
        <div className="nx-progress" data-hue="sky"><i style={{ width: leave.days ? `${Math.min(100, (leave.used / leave.days) * 100)}%` : '0%' }} /></div>
        <div className="nx-leave-row"><span>المستخدم <b className="num">{leave.used}</b></span><span>الرصيد الكلي <b className="num">{leave.days ?? '—'}</b></span></div>
      </div>
      {leaveForm}
    </NxCard>
  )

  return (
    <div className="nx nx-emp">
      {!mine && <Crumbs trail={[{ label: 'الموظفون', to: '/users' }, ...(f.user.branch ? [{ label: `فرع ${f.user.branch.name}` }] : []), { label: f.user.name }]} />}
      <section className="nx-hero">
        <div className="nx-hero-cover"><span>{mine ? 'ملفي' : 'ملف الموظف'}</span></div>
        <div className="nx-hero-main">
          <div className="nx-hero-photo"><NxAvatar name={f.user.name} size={96} hue="rose" /></div>
          <div className="nx-hero-id">
            <h1>{f.user.name}</h1>
            <p>{[f.job.job_title ?? f.user.role?.name, f.job.department?.name].filter(Boolean).join(' · ') || '—'}</p>
            <div className="nx-hero-meta">
              <span><Building2 size={15} /> {f.user.branch ? `فرع ${f.user.branch.name}` : 'الإدارة العامة'}</span>
              {f.job.hire_date && <span><CalendarDays size={15} /> منذ <span className="num">{f.job.hire_date}</span></span>}
              <span><Clock3 size={15} /> {f.job.tracks_attendance ? (f.job.punch_anywhere ? 'يسجّل الحضور من أي مكان' : 'يسجّل الحضور') : 'لا يسجّل الحضور'}</span>
              <span className="num" dir="ltr">@{f.user.username}</span>
            </div>
          </div>
          <div className="nx-hero-side">
            <span className="nx-chip nx-chip-dot" data-hue={STATUS_HUE[f.status]}>{STATUS_LABEL[f.status]}</span>
            {(f.can.edit_job || f.can.set_status) && <div className="nx-hero-actions">
              {f.can.set_status && <Button variant="ghost" onClick={() => setEdit('status')}>تغيير الحالة</Button>}
              {f.can.edit_job && <Button variant="primary" icon={<Briefcase size={16} />} onClick={() => setEdit('job')}>العمل والأجر</Button>}
            </div>}
          </div>
        </div>
        <NxTabs label="أقسام الملف" tabs={tabs} value={tab} onChange={setTab} />
      </section>
      {f.status === 'terminated' && f.termination_reason && <div className="banner danger"><p>سبب الفصل: {f.termination_reason}</p></div>}
      <EmployeeBody key={f.user.id} file={f} tab={tab} profile={profile} leave={leaveCard} personal={personalCard}
        documents={<Attachments file={f} onChange={(attachments) => setData({ ...f, attachments })} />} />

      {(edit === 'personal' || edit === 'wallet') && <PersonalDialog file={f} part={edit} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
      {edit === 'job' && <JobDialog file={f} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
      {edit === 'status' && <StatusDialog file={f} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
    </div>
  )
}

function PItem({ icon, hue, k, v, num }: { icon: ReactNode; hue: Hue; k: string; v: string | null | undefined; num?: boolean }) {
  return (
    <li>
      <span className="nx-pico" data-hue={hue}>{icon}</span>
      <span className="nx-pt"><small>{k}</small><b className={num ? 'num' : undefined} dir={num && v ? 'ltr' : undefined} data-empty={!v || undefined}>{v || 'غير مُدخل'}</b></span>
    </li>
  )
}

function Info({ k, v, num, wide }: { k: string; v: string | null | undefined; num?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'nx-info-wide' : undefined}>
      <dt>{k}</dt>
      <dd className={num ? 'num' : undefined} dir={num && v ? 'ltr' : undefined} data-empty={!v || v === '—' || undefined}>{v || 'غير مُدخل'}</dd>
    </div>
  )
}

function useSave(onSaved: (f: File_) => void) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  async function run(path: string, method: string, body: unknown) {
    setBusy(true); setFields({}); setError(null)
    try {
      const f = await api<File_>(path, { method, body })
      toast('تم الحفظ')
      onSaved(f)
    } catch (e) {
      if (e instanceof ApiError) { setFields(e.fields); setError(Object.keys(e.fields).length ? null : e.message) }
    } finally { setBusy(false) }
  }
  return { busy, fields, error, run }
}

function PersonalDialog({ file, part, onClose, onSaved, onboarding = false, uploading = false, documents }: { documents?: ReactNode; file: File_; uploading?: boolean; onboarding?: boolean; part: 'personal' | 'wallet'; onClose(): void; onSaved(f: File_): void }) {
  const { setUser, state } = useAuth()
  const p = file.personal
  const [form, setForm] = useState({
    name: file.user.name, national_id: p.national_id ?? '', phone: p.phone ?? '', address: p.address ?? '',
    education_level: p.education_level ?? '', specialty: p.specialty ?? '', gender: p.gender ?? '',
    payment_method: p.payment_method ?? 'wallet', provider: p.provider ?? '', account_number: p.account_number ?? '',
    account_holder_name: p.account_holder_name ?? '', account_holder_national_id: p.account_holder_national_id ?? '', account_holder_phone: p.account_holder_phone ?? '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const { busy, fields, error, run } = useSave((f) => {
    // Keep the name in the top bar right when someone edits their own file.
    if (state.status === 'signed_in' && state.user.id === f.user.id) setUser({ ...state.user, name: f.user.name, needs_profile_completion: f.user.needs_profile_completion })
    onSaved(f)
  })
  const nul = (v: string) => (v.trim() === '' ? null : v.trim())

  function save(e?: FormEvent) {
    e?.preventDefault()
    if (uploading) return
    const body = part === 'personal'
      ? { name: form.name, national_id: nul(form.national_id), phone: nul(form.phone), address: nul(form.address), education_level: nul(form.education_level), specialty: nul(form.specialty), gender: nul(form.gender) }
      : { payment_method: form.payment_method, provider: nul(form.provider), account_number: nul(form.account_number), account_holder_name: nul(form.account_holder_name), account_holder_national_id: nul(form.account_holder_national_id), account_holder_phone: nul(form.account_holder_phone) }
    void run(`/employees/${file.user.id}/personal`, 'PATCH', body)
  }

  const input = (k: keyof typeof form, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={lbl} error={fields[k]}>{(id) => <input id={id} className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />}</Field>
  )
  const digits = { inputMode: 'numeric' as const, dir: 'ltr', className: 'input num' }

  const formContent = (
    <form id={onboarding ? "employee-personal-onboarding" : undefined} className="form-grid" onSubmit={save}>
      {part === 'personal' ? (
        <>
          {input('name', 'الاسم الرباعي')}
          <div className="af-row2">{input('national_id', 'رقم الهوية', digits)}{input('phone', 'رقم الجوال', { ...digits, inputMode: 'tel', placeholder: '05xxxxxxxx' })}</div>
          {input('address', 'مكان السكن')}
          <div className="af-row2">
            <Field label="آخر مؤهل" error={fields.education_level}>{(id) => (
              <ChoiceField id={id} className="input select" value={form.education_level} onChange={(e) => set('education_level', e.target.value)}>
                <option value="">—</option>{EDUCATION.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </ChoiceField>)}</Field>
            {input('specialty', 'التخصص')}
          </div>
          <div className="field">
            <label>الجنس</label>
            <div className="segmented" role="radiogroup" aria-label="الجنس">
              <button type="button" role="radio" aria-checked={form.gender === 'male'} onClick={() => set('gender', 'male')}>ذكر</button>
              <button type="button" role="radio" aria-checked={form.gender === 'female'} onClick={() => set('gender', 'female')}>أنثى</button>
            </div>
            {fields.gender && <ErrorBanner text={fields.gender} />}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>النوع</label>
            <div className="segmented" role="radiogroup" aria-label="النوع">
              <button type="button" role="radio" aria-checked={form.payment_method === 'wallet'} onClick={() => set('payment_method', 'wallet')}>محفظة</button>
              <button type="button" role="radio" aria-checked={form.payment_method === 'bank'} onClick={() => set('payment_method', 'bank')}>حساب بنك</button>
            </div>
          </div>
          {input('provider', form.payment_method === 'bank' ? 'اسم البنك' : 'اسم المحفظة', { placeholder: form.payment_method === 'bank' ? 'مثال: بنك فلسطين' : 'مثال: PalPay' })}
          {input('account_number', 'رقم الحساب', digits)}
          {input('account_holder_name', 'اسم صاحب الحساب')}
          <div className="af-row2">{input('account_holder_national_id', 'هوية صاحب الحساب', digits)}{input('account_holder_phone', 'جوال صاحب الحساب', { ...digits, inputMode: 'tel' })}</div>
        </>
      )}
      <ErrorBanner text={error} />

    </form>
  )

  if (onboarding) return <>
    <section className="card glass af-pad af-onboarding">{formContent}</section>
    {documents}
    <Button type="submit" form="employee-personal-onboarding" variant="primary" busy={busy} disabled={uploading}>حفظ البيانات الشخصية</Button>
  </>

  return (
    <Dialog open onClose={onClose} title={part === 'personal' ? 'البيانات الشخصية' : 'المحفظة / الحساب البنكي'}
      icon={part === 'personal' ? <UserRound size={20} /> : <Wallet size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => save()}>حفظ</Button></>}>
      {formContent}
    </Dialog>
  )
}

function JobDialog({ file, onClose, onSaved }: { file: File_; onClose(): void; onSaved(f: File_): void }) {
  const j = file.job
  const deps = useLoad<{ departments: Array<{ id: number; name: string; is_active: boolean }> }>(file.user.branch ? `/departments?branch_id=${file.user.branch.id}` : '/departments')
  const schedules = useLoad<{ schedules: Schedule[] }>(file.user.branch ? `/schedules?branch_id=${file.user.branch.id}` : null)
  const [form, setForm] = useState({
    job_title: j.job_title ?? '', department_id: String(j.department_id ?? ''), work_schedule_id: String(j.work_schedule_id ?? ''),
    salary_type: j.salary_type ?? 'monthly', salary_amount: j.salary_amount ? String(Number(j.salary_amount)) : '',
    daily_hours: String(Number(j.daily_hours)), hire_date: j.hire_date ?? '', tracks_attendance: j.tracks_attendance, punch_anywhere: j.punch_anywhere,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const { busy, fields, error, run } = useSave(onSaved)

  function save(e?: FormEvent) {
    e?.preventDefault()
    void run(`/employees/${file.user.id}/job`, 'PATCH', {
      job_title: form.job_title.trim() || null, department_id: form.department_id ? Number(form.department_id) : null,
      work_schedule_id: form.work_schedule_id ? Number(form.work_schedule_id) : null, salary_type: form.salary_type,
      salary_amount: form.salary_amount === '' ? null : Number(form.salary_amount), daily_hours: Number(form.daily_hours),
      hire_date: form.hire_date || null, tracks_attendance: form.tracks_attendance, punch_anywhere: form.punch_anywhere,
    })
  }

  return (
    <Dialog open onClose={onClose} title="البيانات الوظيفية" subtitle={file.user.name} icon={<Briefcase size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => save()}>حفظ</Button></>}>
      <form className="form-grid" onSubmit={save}>
        <div className="af-row2">
          <Field label="المسمى الوظيفي" error={fields.job_title}>{(id) => <input id={id} className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} placeholder="مثال: محصّل، كهربائي" />}</Field>
          <Field label="القسم" error={fields.department_id}>{(id) => (
            <ChoiceField id={id} className="input select" value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
              <option value="">—</option>{deps.data?.departments.filter((d) => d.is_active || String(d.id) === form.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </ChoiceField>)}</Field>
        </div>
        <div className="field">
          <label>نوع الراتب</label>
          <div className="segmented" role="radiogroup" aria-label="نوع الراتب">
            {SALARY_TYPES.map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={form.salary_type === k} onClick={() => set('salary_type', k)}>{v}</button>)}
          </div>
        </div>
        <div className="af-row2">
          <Field label={salaryLabel(form.salary_type)} error={fields.salary_amount}>{(id) => <input id={id} className="input num" inputMode="decimal" dir="ltr" value={form.salary_amount} onChange={(e) => set('salary_amount', e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>
          <Field label="ساعات الدوام باليوم" error={fields.daily_hours}>{(id) => <input id={id} className="input num" inputMode="decimal" dir="ltr" value={form.daily_hours} onChange={(e) => set('daily_hours', e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>
        </div>
        <div className="af-row2">
          <Field label="تاريخ التوظيف" error={fields.hire_date}>{(id) => <input id={id} className="input num" type="date" value={form.hire_date} onChange={(e) => set('hire_date', e.target.value)} />}</Field>
          <Field label="الدوام" error={fields.work_schedule_id}>{(id) => (
            <ChoiceField id={id} className="input select" value={form.work_schedule_id} onChange={(e) => set('work_schedule_id', e.target.value)} disabled={!file.user.branch}>
              <option value="">الأساسي للفرع</option>{schedules.data?.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </ChoiceField>)}</Field>
        </div>
        <div className="af-switches">
          <Switch label="يسجّل الحضور" on={form.tracks_attendance} onChange={(v) => set('tracks_attendance', v)} />
          <Switch label="الـQR من أي مكان" on={form.punch_anywhere} onChange={(v) => set('punch_anywhere', v)} />
        </div>
        <ErrorBanner text={error} />
      </form>
    </Dialog>
  )
}

function StatusDialog({ file, onClose, onSaved }: { file: File_; onClose(): void; onSaved(f: File_): void }) {
  const [status, setStatus] = useState<EmployeeStatus>(file.status)
  const [reason, setReason] = useState('')
  const { busy, fields, error, run } = useSave(onSaved)
  const needsReason = status === 'suspended' || status === 'terminated'
  return (
    <Dialog open onClose={onClose} title="حالة الموظف" subtitle={file.user.name} icon={<History size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant={status === 'terminated' ? 'danger' : 'primary'} busy={busy} disabled={status === file.status} onClick={() => void run(`/employees/${file.user.id}/status`, 'POST', { status, reason: reason.trim() || null })}>حفظ</Button></>}>
      <div className="form-grid">
        <div className="chips" role="radiogroup" aria-label="الحالة">
          {(Object.keys(STATUS_LABEL) as EmployeeStatus[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>)}
        </div>
        {status === 'terminated' && <p className="eyebrow">لا يستطيع الموظف المفصول الدخول إلى النظام. وإذا أعدته إلى «فعّال» يعود حسابه للعمل.</p>}
        <Field label={needsReason ? 'السبب (مطلوب)' : 'السبب (اختياري)'} error={fields.reason}>
          {(id) => <textarea id={id} className="input textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <ErrorBanner text={error} />
      </div>
    </Dialog>
  )
}

function Attachments({ file, onChange, onboarding=false, onBusy }: { onboarding?:boolean; onBusy?(busy:boolean):void; file: File_; onChange(a: File_['attachments']): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [type, setType] = useState('id_photo')
  const [busy, setBusy] = useState(false)
  const canEdit = file.can.edit_personal

  async function upload(f: globalThis.File, category=type) {
    onBusy?.(true)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('type', category)
      body.append('file', f)
      const res = await api<{ attachment: File_['attachments'][number] }>(`/employees/${file.user.id}/attachments`, { method: 'POST', body })
      onChange([res.attachment, ...file.attachments])
      toast('رُفع المرفق')
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'لم يُرفع', 'danger')
    } finally {
      setBusy(false)
      onBusy?.(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove(id: number, name: string) {
    if (!(await confirm({ title: `حذف «${name}»؟`, danger: true, confirmLabel: 'حذف' }))) return
    try {
      await api(`/employees/${file.user.id}/attachments/${id}`, { method: 'DELETE' })
      onChange(file.attachments.filter((a) => a.id !== id))
    } catch (e) { toast(e instanceof ApiError ? e.message : 'لم يُحذف', 'danger') }
  }

  const picker = <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
  if (!onboarding) return (
    <NxCard title="المرفقات" icon={<Paperclip size={17} />} action={canEdit && <div className="nx-upload">
      <ChoiceField className="input select" value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع المرفق">
        {ATTACHMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </ChoiceField>
      <Button variant="primary" icon={<Upload size={16} />} busy={busy} onClick={() => input.current?.click()}>رفع ملف</Button>
      {picker}
    </div>}>
      {file.attachments.length === 0 ? <NxEmpty icon={<Paperclip size={26} />} title="لا توجد مرفقات بعد" text={canEdit ? 'اختر نوع المرفق ثم ارفع صورة أو ملف PDF، حتى ٦ ميغابايت.' : undefined} /> : (
        <div className="nx-docs">
          {file.attachments.map((a) => {
            const img = a.mime.startsWith('image/')
            return (
              <div key={a.id} className="nx-doc">
                <button type="button" className="nx-doc-open" onClick={() => void openFile(`/employees/${file.user.id}/attachments/${a.id}`).catch((e) => toast(e.message, 'danger'))}>
                  <span className="nx-ico" data-hue={img ? 'sky' : 'rose'}>{img ? <ImageIcon size={20} /> : <FileText size={20} />}</span>
                  <span className="nx-doc-t"><b>{label(ATTACHMENT_TYPES, a.type)}</b><small><span dir="auto">{a.name}</span> · <span className="num">{Math.max(1, Math.round(a.size / 1024))}</span> ك.ب</small></span>
                </button>
                {canEdit && <button type="button" className="nx-icon-btn" aria-label={`حذف ${a.name}`} onClick={() => void remove(a.id, a.name)}><Trash2 size={16} /></button>}
              </div>
            )
          })}
        </div>
      )}
    </NxCard>
  )

  return (
    <section className="card glass af-pad">
      <h2 className="af-h2"><Paperclip size={18} /> {onboarding ? 'الهوية والشهادات' : 'المرفقات'}</h2>
      {onboarding && canEdit && <div className="af-onboard-uploads">
        <p>أرفق صورة الهوية وشهادة التخصص وشهادات الخبرة المتوفرة لديك. يمكنك إضافة أكثر من شهادة خبرة. الحد الأقصى ٦ ميغابايت لكل ملف.</p>
        {ATTACHMENT_TYPES.filter(([key])=>['id_photo','specialty_cert','experience_cert'].includes(key)).map(([key,name])=>
          <label key={key}>{name}<input type="file" aria-label={name} disabled={busy} accept=".jpg,.jpeg,.png,.webp,.heic,.pdf" onChange={e=>{
            const picked=e.target.files?.[0];e.target.value=''
            if(picked) void upload(picked,key)
          }}/></label>)}
        {busy && <p role="status">جارٍ رفع المرفق…</p>}
      </div>}
      {canEdit && !onboarding && (
        <div className="af-upload">
          <ChoiceField className="input select" value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع المرفق">
            {ATTACHMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </ChoiceField>
          <Button icon={<Upload size={16} />} busy={busy} onClick={() => input.current?.click()}>صورة أو PDF</Button>
          <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
        </div>
      )}
      <div className="rows">
        {file.attachments.map((a) => (
          <div key={a.id} className="row">
            {a.mime.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
            <button type="button" className="link-btn row-label" onClick={() => void openFile(`/employees/${file.user.id}/attachments/${a.id}`).catch((e) => toast(e.message, 'danger'))}>
              {label(ATTACHMENT_TYPES, a.type)}<small className="af-sub">{a.name} · {Math.max(1, Math.round(a.size / 1024))} ك.ب</small>
            </button>
            {canEdit && <button type="button" className="icon-btn" aria-label={`حذف ${a.name}`} onClick={() => void remove(a.id, a.name)}><Trash2 size={16} /></button>}
          </div>
        ))}
        {file.attachments.length === 0 && <p className="eyebrow">لا توجد مرفقات بعد.</p>}
      </div>
    </section>
  )
}
