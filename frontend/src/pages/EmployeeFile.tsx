import { Briefcase, FileText, History, Image as ImageIcon, Paperclip, Pencil, Trash2, Upload, UserRound, Wallet } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { api, ApiError, openFile } from '../api/client'
import {
  ATTACHMENT_TYPES, EDUCATION, SALARY_TYPES, STATUS_LABEL,
  type EmployeeFile as File_, type EmployeeStatus, type Schedule,
} from '../api/types'
import { useAuth, useUser } from '../app/auth'
import { formatLongDate } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { useConfirm } from '../ui/Confirm'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner, Field, Switch } from '../ui/Field'
import { Loading, PageHead } from '../ui/PageHead'
import { Avatar, Button, Pill, type Tone } from '../ui/primitives'
import { useToast } from '../ui/Toast'

const label = (list: Array<[string, string]>, v: string | null | undefined) => list.find(([k]) => k === v)?.[1] ?? '—'
const STATUS_TONE: Record<EmployeeStatus, Tone> = { active: 'ok', trainee: 'info', suspended: 'warn', terminated: 'danger' }

/** /employees/:id, or the signed-in person's own file when no id is given. */
export function EmployeeFile() {
  const me = useUser()
  const params = useParams()
  const id = params.id ?? String(me.id)
  const { data, error, loading, setData } = useLoad<File_>(`/employees/${id}`)
  const [edit, setEdit] = useState<'personal' | 'wallet' | 'job' | 'status' | null>(null)

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const f = data
  const p = f.personal
  const mine = f.user.id === me.id

  return (
    <>
      <PageHead title={mine ? 'ملفي' : f.user.name} eyebrow={mine ? f.user.name : 'ملف الموظف'}
        actions={<Pill tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Pill>} />

      <section className="card glass af-pad af-profile">
        <Avatar name={f.user.name} size={64} />
        <div>
          <b className="af-profile-name">{f.user.name}</b>
          <p className="eyebrow">
            {f.job.job_title ?? f.user.role?.name}{f.user.branch ? ` · ${f.user.branch.name}` : ''}{f.job.department ? ` · ${f.job.department.name}` : ''}
          </p>
          <p className="eyebrow" dir="auto">@{f.user.username}</p>
        </div>
        {f.can.set_status && <Button onClick={() => setEdit('status')}>تغيير الحالة</Button>}
      </section>
      {f.status === 'terminated' && f.termination_reason && <div className="banner danger" style={{ marginTop: 12 }}><p>سبب الفصل: {f.termination_reason}</p></div>}

      <div className="af-grid2" style={{ marginTop: 16 }}>
        <Section icon={<UserRound size={18} />} title="البيانات الشخصية" onEdit={f.can.edit_personal ? () => setEdit('personal') : undefined}>
          <Row k="الاسم الكامل" v={f.user.name} />
          <Row k="رقم الهوية" v={p.national_id} num />
          <Row k="رقم الجوال" v={p.phone} num />
          <Row k="مكان السكن" v={p.address} />
          <Row k="آخر مؤهل" v={label(EDUCATION, p.education_level)} />
          <Row k="التخصص" v={p.specialty} />
          <Row k="الجنس" v={p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : null} />
        </Section>

        <Section icon={<Wallet size={18} />} title="المحفظة / الحساب البنكي" onEdit={f.can.edit_personal ? () => setEdit('wallet') : undefined}>
          <Row k="النوع" v={p.payment_method === 'wallet' ? 'محفظة' : p.payment_method === 'bank' ? 'حساب بنك' : null} />
          <Row k={p.payment_method === 'bank' ? 'البنك' : 'المحفظة'} v={p.provider} />
          <Row k="رقم الحساب" v={p.account_number} num />
          <Row k="اسم صاحب الحساب" v={p.account_holder_name} />
          <Row k="هوية صاحب الحساب" v={p.account_holder_national_id} num />
          <Row k="جوال صاحب الحساب" v={p.account_holder_phone} num />
        </Section>

        <Section icon={<Briefcase size={18} />} title="البيانات الوظيفية" onEdit={f.can.edit_job ? () => setEdit('job') : undefined}>
          <Row k="المسمى الوظيفي" v={f.job.job_title} />
          <Row k="القسم" v={f.job.department?.name} />
          <Row k="الدوام" v={f.job.schedule?.name ?? 'الأساسي للفرع'} />
          <Row k="نوع الراتب" v={label(SALARY_TYPES, f.job.salary_type)} />
          <Row k="قيمة الراتب" v={f.job.salary_amount ? `${Number(f.job.salary_amount)} شيكل` : null} num />
          <Row k="ساعات الدوام" v={String(Number(f.job.daily_hours))} num />
          <Row k="تاريخ التوظيف" v={f.job.hire_date} num />
          <Row k="الحضور" v={f.job.tracks_attendance ? (f.job.punch_anywhere ? 'يسجّل · الـQR من أي مكان' : 'يسجّل') : 'لا يسجّل الحضور'} />
        </Section>

        <Attachments file={f} onChange={(attachments) => setData({ ...f, attachments })} />
      </div>

      {f.status_log.length > 0 && (
        <Section icon={<History size={18} />} title="سجل الحالة" style={{ marginTop: 16 }}>
          {f.status_log.map((l, i) => (
            <div key={i} className="row">
              <span className="row-label">{l.from ? `${STATUS_LABEL[l.from as EmployeeStatus]} ← ` : ''}{STATUS_LABEL[l.to]}
                <small className="af-sub">{l.by ?? '—'}{l.reason ? ` · ${l.reason}` : ''}</small>
              </span>
              <span className="row-value">{formatLongDate(new Date(l.at))}</span>
            </div>
          ))}
        </Section>
      )}

      {(edit === 'personal' || edit === 'wallet') && <PersonalDialog file={f} part={edit} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
      {edit === 'job' && <JobDialog file={f} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
      {edit === 'status' && <StatusDialog file={f} onClose={() => setEdit(null)} onSaved={(nf) => { setData(nf); setEdit(null) }} />}
    </>
  )
}

function Section({ icon, title, onEdit, children, style }: { icon: ReactNode; title: string; onEdit?(): void; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="card glass af-pad" style={style}>
      <div className="af-row-between">
        <h2 className="af-h2">{icon} {title}</h2>
        {onEdit && <button type="button" className="icon-btn" aria-label={`تعديل ${title}`} onClick={onEdit}><Pencil size={16} /></button>}
      </div>
      <div className="rows">{children}</div>
    </section>
  )
}

function Row({ k, v, num }: { k: string; v: string | null | undefined; num?: boolean }) {
  return (
    <div className="row af-kv">
      <span className="row-label">{k}</span>
      <span className={`row-value${num ? ' num' : ''}`} dir={num ? 'ltr' : undefined}>{v || '—'}</span>
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

function PersonalDialog({ file, part, onClose, onSaved }: { file: File_; part: 'personal' | 'wallet'; onClose(): void; onSaved(f: File_): void }) {
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
    if (state.status === 'signed_in' && state.user.id === f.user.id) setUser({ ...state.user, name: f.user.name })
    onSaved(f)
  })
  const nul = (v: string) => (v.trim() === '' ? null : v.trim())

  function save(e?: FormEvent) {
    e?.preventDefault()
    const body = part === 'personal'
      ? { name: form.name, national_id: nul(form.national_id), phone: nul(form.phone), address: nul(form.address), education_level: nul(form.education_level), specialty: nul(form.specialty), gender: nul(form.gender) }
      : { payment_method: form.payment_method, provider: nul(form.provider), account_number: nul(form.account_number), account_holder_name: nul(form.account_holder_name), account_holder_national_id: nul(form.account_holder_national_id), account_holder_phone: nul(form.account_holder_phone) }
    void run(`/employees/${file.user.id}/personal`, 'PATCH', body)
  }

  const input = (k: keyof typeof form, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={lbl} error={fields[k]}>{(id) => <input id={id} className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />}</Field>
  )
  const digits = { inputMode: 'numeric' as const, dir: 'ltr', className: 'input num' }

  return (
    <Dialog open onClose={onClose} title={part === 'personal' ? 'البيانات الشخصية' : 'المحفظة / الحساب البنكي'} icon={part === 'personal' ? <UserRound size={20} /> : <Wallet size={20} />}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" busy={busy} onClick={() => save()}>حفظ</Button></>}>
      <form className="form-grid" onSubmit={save}>
        {part === 'personal' ? (
          <>
            {input('name', 'الاسم الرباعي')}
            <div className="af-row2">{input('national_id', 'رقم الهوية', digits)}{input('phone', 'رقم الجوال', { ...digits, inputMode: 'tel', placeholder: '05xxxxxxxx' })}</div>
            {input('address', 'مكان السكن')}
            <div className="af-row2">
              <Field label="آخر مؤهل" error={fields.education_level}>{(id) => (
                <select id={id} className="input select" value={form.education_level} onChange={(e) => set('education_level', e.target.value)}>
                  <option value="">—</option>{EDUCATION.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>)}</Field>
              {input('specialty', 'التخصص')}
            </div>
            <div className="field">
              <label>الجنس</label>
              <div className="segmented" role="radiogroup" aria-label="الجنس">
                <button type="button" role="radio" aria-checked={form.gender === 'male'} onClick={() => set('gender', 'male')}>ذكر</button>
                <button type="button" role="radio" aria-checked={form.gender === 'female'} onClick={() => set('gender', 'female')}>أنثى</button>
              </div>
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
    </Dialog>
  )
}

function JobDialog({ file, onClose, onSaved }: { file: File_; onClose(): void; onSaved(f: File_): void }) {
  const j = file.job
  const deps = useLoad<{ departments: Array<{ id: number; name: string; is_active: boolean }> }>('/departments')
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
            <select id={id} className="input select" value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
              <option value="">—</option>{deps.data?.departments.filter((d) => d.is_active || String(d.id) === form.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>)}</Field>
        </div>
        <div className="field">
          <label>نوع الراتب</label>
          <div className="segmented" role="radiogroup" aria-label="نوع الراتب">
            {SALARY_TYPES.map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={form.salary_type === k} onClick={() => set('salary_type', k)}>{v}</button>)}
          </div>
        </div>
        <div className="af-row2">
          <Field label="قيمة الراتب (شيكل)" error={fields.salary_amount}>{(id) => <input id={id} className="input num" inputMode="decimal" dir="ltr" value={form.salary_amount} onChange={(e) => set('salary_amount', e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>
          <Field label="ساعات الدوام باليوم" error={fields.daily_hours}>{(id) => <input id={id} className="input num" inputMode="decimal" dir="ltr" value={form.daily_hours} onChange={(e) => set('daily_hours', e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>
        </div>
        <div className="af-row2">
          <Field label="تاريخ التوظيف" error={fields.hire_date}>{(id) => <input id={id} className="input num" type="date" value={form.hire_date} onChange={(e) => set('hire_date', e.target.value)} />}</Field>
          <Field label="الدوام" error={fields.work_schedule_id}>{(id) => (
            <select id={id} className="input select" value={form.work_schedule_id} onChange={(e) => set('work_schedule_id', e.target.value)} disabled={!file.user.branch}>
              <option value="">الأساسي للفرع</option>{schedules.data?.schedules.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>)}</Field>
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

function Attachments({ file, onChange }: { file: File_; onChange(a: File_['attachments']): void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [type, setType] = useState('id_photo')
  const [busy, setBusy] = useState(false)
  const canEdit = file.can.edit_personal

  async function upload(f: globalThis.File) {
    setBusy(true)
    try {
      const body = new FormData()
      body.append('type', type)
      body.append('file', f)
      const res = await api<{ attachment: File_['attachments'][number] }>(`/employees/${file.user.id}/attachments`, { method: 'POST', body })
      onChange([res.attachment, ...file.attachments])
      toast('رُفع المرفق')
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'لم يُرفع', 'danger')
    } finally {
      setBusy(false)
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

  return (
    <section className="card glass af-pad">
      <h2 className="af-h2"><Paperclip size={18} /> المرفقات</h2>
      {canEdit && (
        <div className="af-upload">
          <select className="input select" value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع المرفق">
            {ATTACHMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
