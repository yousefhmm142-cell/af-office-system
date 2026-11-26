import { ChoiceField } from '../../ui/ChoiceField'
import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../../api/client'
import { todayISO } from '../../lib/dates'
import { ErrorBanner } from '../../ui/Field'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'

const kinds = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', other: 'إجازة أخرى', permission: 'إذن بالساعات' }
export function LeaveRequestForm({onSent}:{onSent():void}) {
  const toast = useToast()

  const [kind, setKind] = useState<keyof typeof kinds>('annual')
  const [start,setStart] = useState(todayISO)
  const [end,setEnd] = useState(todayISO)
  const [from,setFrom] = useState('')
  const [to,setTo] = useState('')
  const [reason,setReason] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const body={kind,starts:start,ends:kind==='permission'?start:end,reason,...(kind==='permission'?{from_time:from,to_time:to}:{})}
    setBusy(true)
    setError('')
    try {
      await api('/leaves',{method:'POST',body})
      onSent()
      toast('تم حفظ الطلب')
    } catch(e) { setError(e instanceof ApiError ? Object.values(e.fields)[0] || e.message : 'تعذّر حفظ الطلب') }
    finally { setBusy(false) }
  }
  return <><ErrorBanner text={error} />
    <form onSubmit={submit} className="card glass af-pad form-grid">
      <label>نوع الطلب<ChoiceField className="input" value={kind} onChange={e=>setKind(e.target.value as keyof typeof kinds)}>{Object.entries(kinds).map(([key,name])=><option key={key} value={key}>{name}</option>)}</ChoiceField></label>
      <label>تاريخ بداية المناوبة<input className="input" type="date" required value={start} onChange={e=>{setStart(e.target.value);if(end<e.target.value)setEnd(e.target.value)}} /></label>
      {kind === 'permission' ? <div className="af-row2"><label>من الساعة<input className="input" type="time" required value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>حتى الساعة<input className="input" type="time" required value={to} onChange={e=>setTo(e.target.value)} /></label></div> :
        <label>حتى تاريخ<input className="input" type="date" min={start} required value={end} onChange={e=>setEnd(e.target.value)} /></label>}
      <label>السبب<textarea className="input" required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <Button type="submit" variant="send" busy={busy}>إرسال الطلب</Button></form>
  </>
}
