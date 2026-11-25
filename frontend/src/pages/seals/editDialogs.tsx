import { Stamp } from 'lucide-react'
import { FootHint,SummaryAside,saveOnCtrlEnter } from '../../ui/SummaryAside'
import { useMemo,useState } from 'react'
import { todayISO } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Chip,TextField } from '../../ui/form'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { sealErrorText,useSealActions,useTechnicians } from './repo'
import { ordinalWord,parseSealNumbers,sealStatusInfo,type SealBatch,type SealData,type SealRoll,continueAfterSeparator,rollPrefix,withoutPendingStart } from './model'
import { dayLabel } from './parts'

// ---------- Changing a batch: who has it, and which day ----------
export function EditBatchDialog({ batch, data, onClose }: { batch: SealBatch; data: SealData; onClose(): void }) {
  const { updateBatch } = useSealActions()
  const toast = useToast()
  const technicians = useTechnicians()
  const [tech, setTech] = useState<string | null>(batch.technicianId)
  const [date, setDate] = useState(batch.issuedOn)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // New seals for this same batch: from its own roll, typed the same way as when issuing.
  const roll = data.rolls.find((r) => r.id === batch.rollId) ?? null
  const prefix = roll ? rollPrefix(roll) : ''
  const [text, setText] = useState(prefix)
  // Seals taken out of this batch (back to the stock) when she presses save; tap again to keep one.
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const inBatch = useMemo(() => data.seals.filter((s) => s.batchId === batch.id).sort((a, b) => (a.batchPos ?? 0) - (b.batchPos ?? 0)), [data.seals, batch.id])
  const flip = (no: number) => setRemoved((r) => { const n = new Set(r); if (n.has(no)) n.delete(no); else n.add(no); return n })
  const bySeal = useMemo(() => new Map(data.seals.map((s) => [s.sealNo, s])), [data.seals])
  const parsed = useMemo(() => parseSealNumbers(withoutPendingStart(text, prefix)), [text, prefix])
  const numbers = parsed.numbers.map((n) => (roll && n < roll.fromNo && n % 100 === 0 && n + 100 <= roll.toNo ? n + 100 : n))
  const rows = numbers.map((n) => {
    const s = bySeal.get(n)
    const bad = !s ? 'غير موجود' : s.rollId !== batch.rollId ? 'من رول آخر' : s.status !== 'in_stock' ? sealStatusInfo[s.status].label : null
    return { n, s, bad }
  })
  const addOk = rows.every((r) => !r.bad) && parsed.bad.length === 0
  // A person no longer active still shows, so the batch keeps its name.
  const list = !batch.technicianId || technicians.some((t) => t.id === batch.technicianId) ? technicians : [{ id: batch.technicianId, fullName: data.names.get(batch.technicianId) ?? '—' }, ...technicians]

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (!addOk) { setBusy(false); return }
      await updateBatch(batch.id, tech === batch.technicianId ? null : tech, date, numbers, [...removed])
      const parts = [rows.length > 0 ? `أُضيف ${rows.length}` : '', removed.size > 0 ? `رجع للمخزن ${removed.size}` : ''].filter(Boolean)
      toast(parts.length ? `عُدّلت الدفعة: ${parts.join('، ')}` : 'عُدّلت الدفعة')
      onClose()
    } catch (e) {
      setError(sealErrorText(e))
      setBusy(false)
    }
  }

  const aside = (
    <SummaryAside
      title="ملخص التعديل"
      bigLabel="الفني"
      big={list.find((t) => t.id === tech)?.fullName ?? 'بدون اسم'}
      rows={[['الدفعة', ordinalWord(batch.batchNo)], ['التاريخ', dayLabel(date)], ['أختام الدفعة', <span className="num">{inBatch.length - removed.size + rows.length}</span>]]}
      more={[['يُضاف', <span className="num">{rows.length}</span>], ['يُحذف', <span className="num">{removed.size}</span>]]}
    />
  )

  return (
    <Dialog
      className="seal-dialog"
      open
      onClose={onClose}
      title={`تعديل الدفعة ${ordinalWord(batch.batchNo)}`}
      subtitle="غيّر الفني أو التاريخ، أضف أختام أو احذفها."
      icon={<Stamp size={20} />}
      aside={aside}
      footer={
        <>
          <FootHint />
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" busy={busy} disabled={!addOk} onClick={() => void save()}>حفظ</Button>
        </>
      }
    >
      <div className="issue-form" onKeyDown={saveOnCtrlEnter(() => void save())}>
        <div className="field">
          <span className="label">الفني</span>
          <div className="chips">
            {list.map((t) => <Chip key={t.id} pressed={tech === t.id} onClick={() => setTech(t.id)}>{t.fullName}</Chip>)}
          </div>
        </div>
        <label className="field">
          <span className="label">تاريخ الصرف</span>
          <input type="date" className="input" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {inBatch.length > 0 && (
          <div className="field">
            <span className="label">أختام الدفعة (اضغط على الختم لحذفه من الدفعة)</span>
            <div className="parsed">
              {inBatch.map((s) => {
                const out = removed.has(s.sealNo)
                const locked = s.status !== 'issued'
                return (
                  <button
                    key={s.sealNo}
                    type="button"
                    className="seal-pill"
                    data-status={s.status}
                    data-bad={out ? true : undefined}
                    disabled={locked}
                    aria-pressed={out}
                    title={locked ? 'ختم مستخدم، ما بينحذف من هون' : out ? 'سيُحذف، اضغط للتراجع' : 'اضغط للحذف'}
                    onClick={() => flip(s.sealNo)}
                    style={out ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}
                  >
                    <i aria-hidden="true" />
                    <span className="num">{s.sealNo}</span>
                    <small>{out ? 'سيُحذف' : locked ? 'مستخدم' : '✕'}</small>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <label className="field">
          <span className="label">
            إضافة أختام جديدة للدفعة{roll ? <> (من الرول <b className="num">{roll.fromNo}–{roll.toNo}</b>). أول الرقم <b className="num roll-fixed">{prefix}</b> جاهز، وكل ما تضغط <b>مسافة</b> بيجيك من جديد</> : ''}
          </span>
          <textarea
            className="seal-input"
            dir="ltr"
            value={text}
            placeholder={`${prefix}02 ${prefix}35 …`}
            onChange={(e) => setText(continueAfterSeparator(text, e.target.value, prefix, e.target.selectionStart === e.target.value.length))}
          />
        </label>
        {(rows.length > 0 || parsed.bad.length > 0) && (
          <div className="parsed" aria-live="polite">
            {rows.map((r) => (
              <span key={r.n} className="seal-pill" data-status={r.s?.status ?? 'lost'} data-bad={r.bad ? true : undefined}>
                <i aria-hidden="true" />
                <span className="num">{r.n}</span>
                {r.bad && <small>{r.bad}</small>}
              </span>
            ))}
            {parsed.bad.map((b) => (
              <span key={b} className="seal-pill" data-status="lost" data-bad><i aria-hidden="true" /><span className="num">{b}</span><small>رقم غير صحيح</small></span>
            ))}
          </div>
        )}
        <p className="field-hint">الفني والتاريخ يتغيّران لكل أختام الدفعة، والأختام الجديدة تلتحق بها. تقدر ترجع تعدّلها وتضيف أكثر. لتغيير ختم بعينه افتحه من «سجل الأختام».</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}

// ---------- Changing a roll: its receiving day and note ----------
export function EditRollDialog({ roll, onClose }: { roll: SealRoll; onClose(): void }) {
  const { updateRoll } = useSealActions()
  const toast = useToast()
  const [date, setDate] = useState(roll.receivedOn)
  const [note, setNote] = useState(roll.note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await updateRoll(roll.id, date, note)
      toast('عُدّل الرول')
      onClose()
    } catch (e) {
      setError(sealErrorText(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      className="seal-dialog"
      open
      onClose={onClose}
      title={`تعديل الرول ${roll.fromNo} - ${roll.toNo}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>حفظ</Button>
        </>
      }
    >
      <div className="issue-form">
        <label className="field">
          <span className="label">تاريخ الاستلام</span>
          <input type="date" className="input" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <TextField label="ملاحظة" value={note} onChange={setNote} />
        <p className="field-hint">أرقام الرول نفسها لا تتغيّر. إن سجّلتها غلط، احذف الرول (وهو فاضي) وسجّله من جديد.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}
