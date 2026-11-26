import { FileSpreadsheet, Send } from 'lucide-react'
import { useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useLoad } from '../lib/useLoad'
import { Dialog } from '../ui/Dialog'
import { ErrorBanner } from '../ui/Field'
import { Loading } from '../ui/PageHead'
import { Button } from '../ui/primitives'
import { ReportDownloads } from '../ui/ReportDownloads'
import { useToast } from '../ui/Toast'

interface Report {branch:string; rows:{name:string;department:string|null;username:string;code:string|null;status:string}[]}
const headers=['الموظف','القسم','اسم المستخدم','رمز الدخول المؤقت','حالة الحساب']

export function AccountHandoff({branchId,messageId}:{branchId?:string;messageId?:number}) {
  const [open,setOpen]=useState(false)
  const [sending,setSending]=useState(false)
  const toast=useToast()
  const path=messageId ? `/messages/${messageId}/account-handoff` : `/branches/${branchId}/account-handoff`
  const {data,loading,error}=useLoad<Report>(open ? path : null)
  const sheet=useRef<HTMLDivElement>(null)
  const rows=data?.rows.map(r=>[r.name,r.department??'—',r.username,r.code??'—',r.status]) ?? []
  async function send() {
    setSending(true)
    try {
      await api(path,{method:'POST'})
      toast('أُرسل الكشف إلى مراسلات مدير الفرع')
      setOpen(false)
    } catch(e){toast(e instanceof ApiError ? e.message : 'تعذّر إرسال الكشف','danger')}
    finally{setSending(false)}
  }
  return <><Button icon={<FileSpreadsheet size={17}/>} onClick={()=>setOpen(true)}>كشف تسليم الحسابات</Button>
    {open && <Dialog open title="كشف تسليم الحسابات" className="handoff-dialog" onClose={()=>setOpen(false)}
      footer={branchId && <Button variant="send" icon={<Send size={17}/>} busy={sending} disabled={!rows.length} onClick={()=>void send()}>إرسال إلى مدير الفرع</Button>}>
      {loading && <Loading/>}<ErrorBanner text={error}/>
      {data && <><ReportDownloads sheet={sheet} name={'حسابات موظفي '+data.branch} headers={headers} rows={rows} styled/>
        <div style={{overflowX:'auto'}}><div ref={sheet} className="print-sheet handoff-sheet" dir="rtl">
          <h2>كشف حسابات موظفي {data.branch}</h2><p>{rows.length} حساب · يُسلّم كل موظف بيانات حسابه فقط</p>
          <table className="tbl"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(row=><tr key={row[2]}>{row.map((cell,i)=><td key={i} dir={i===2||i===3?'auto':undefined}>{cell}</td>)}</tr>)}</tbody></table>
          {!rows.length && <p>لا توجد حسابات موظفين في هذا الفرع.</p>}
        </div></div></>}
    </Dialog>}
  </>
}
