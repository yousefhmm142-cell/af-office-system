import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { useUser } from '../app/auth'
import { todayISO } from '../lib/dates'
import { useLoad } from '../lib/useLoad'
import { PageHead } from '../ui/PageHead'
import { ErrorBanner } from '../ui/Field'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/Toast'

const kinds = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', other: 'إجازة أخرى', permission: 'إذن بالساعات' }
const states = { pending: 'بانتظار شؤون الموظفين', escalated: 'محال للإدارة', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى' }
type Leave = { id: number; user_id: number; name: string; kind: keyof typeof kinds; starts: string; ends: string; days: number; reason: string; status: keyof typeof states; from_time: string; to_time: string }
export function Leaves() {
  const me = useUser()
  const toast = useToast()
  const list = useLoad<{requests: Leave[]}>('/leaves')
  const [kind, setKind] = useState<keyof typeof kinds>('annual')
  const [start,setStart] = useState(todayISO)
  const [end,setEnd] = useState(todayISO)
  const [from,setFrom] = useState('')
  const [to,setTo] = useState('')
  const [reason,setReason] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function send(path: string, method: 'POST' | 'PATCH', body: Record<string,unknown>) {
    setBusy(true)
    setError('')
    try {
      await api(path,{method,body})
      if (method === 'POST') setReason('')
      await list.reload()
      toast('تم حفظ الطلب')
    } catch(e) { setError(e instanceof ApiError ? Object.values(e.fields)[0] || e.message : 'تعذّر حفظ الطلب') }
    finally { setBusy(false) }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void send('/leaves','POST',{ kind,starts:start,ends:kind === 'permission' ? start : end,reason,...(kind === 'permission' ? {from_time:from,to_time:to} : {}) })
  }
  return <><PageHead title="الإجازات والأذونات" /><ErrorBanner text={error || list.error} />
    {me.branch && <form onSubmit={submit} className="card glass af-pad form-grid"><h2 className="af-h2">طلب جديد</h2>
      <label>نوع الطلب<select className="input" value={kind} onChange={e=>setKind(e.target.value as keyof typeof kinds)}>{Object.entries(kinds).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
      <label>تاريخ بداية المناوبة<input className="input" type="date" required value={start} onChange={e=>{setStart(e.target.value);if(end<e.target.value)setEnd(e.target.value)}} /></label>
      {kind === 'permission' ? <div className="af-row2"><label>من الساعة<input className="input" type="time" required value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>حتى الساعة<input className="input" type="time" required value={to} onChange={e=>setTo(e.target.value)} /></label></div> :
        <label>حتى تاريخ<input className="input" type="date" min={start} required value={end} onChange={e=>setEnd(e.target.value)} /></label>}
      <label>السبب<textarea className="input" required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <Button type="submit" variant="primary" busy={busy}>إرسال الطلب</Button></form>}
    <section className="card glass af-pad"><h2 className="af-h2">الطلبات</h2>{!list.loading && !list.data?.requests.length && <p>لا توجد طلبات.</p>}
      {list.data?.requests.map(r=>{
        const mine = r.user_id === me.id
        const hr = !mine && me.role?.key === 'hr'
        const review = (hr && r.status === 'pending') || (!mine && me.role?.key === 'management' && r.status === 'escalated')
        const action = (key: string, name: string) => <Button disabled={busy} onClick={()=>send(`/leaves/${r.id}`,'PATCH',{action:key})}>{name}</Button>
        return <article key={r.id} className="af-pad"><h3>{r.name} · {kinds[r.kind]}</h3><p>{r.starts} — {r.ends} · {r.kind==='permission' ? `${r.from_time.slice(0,5)} – ${r.to_time.slice(0,5)}` : `${r.days} أيام دوام`} · {states[r.status]}</p>
          <p>{r.reason}</p><div className="af-toolbar">{review && <>{action('approved','اعتماد')}{action('rejected','رفض')}</>}
          {hr && r.status==='pending' && action('escalated','إحالة للإدارة')}
          {((mine && ['pending','escalated'].includes(r.status)) || (hr && r.status==='approved')) && action('cancelled','إلغاء الطلب')}</div></article>
      })}</section></>
}
