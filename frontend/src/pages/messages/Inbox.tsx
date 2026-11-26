import { AccountHandoff } from '../AccountHandoff'
import { LeaveRequestForm } from './LeaveRequestForm'
import { Dialog } from '../../ui/Dialog'
import { ChoiceField } from '../../ui/ChoiceField'
import { Archive, ArchiveRestore, ArrowRight, Forward, Inbox as InboxIcon, Mail, MailOpen, Paperclip, PenLine, ReplyAll, Search, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, openFile } from '../../api/client'
import { can, useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { Compose, KindIcon, type Draft } from './Compose'
import { fullWhen, KIND, setUnread, when, type Full, type Summary, type Kind } from './lib'

type Folder = 'inbox' | 'sent' | 'archive'
const FOLDERS: Array<[Folder, string, typeof InboxIcon]> = [['inbox', 'الوارد', InboxIcon], ['sent', 'المرسل', Send], ['archive', 'الأرشيف', Archive]]

/** Internal mail: the list on one side, the conversation on the other (one at a time on a phone). */
export function Inbox() {
  const { id } = useParams()
  const navigate = useNavigate()
  const me = useUser()
  const [folder, setFolder] = useState<Folder>('inbox')
  const [url] = useSearchParams()
  const category = (url.get('folder') ?? '') as Kind | 'leaves' | ''
  const [requesting,setRequesting] = useState(false)
  const [branch,setBranch] = useState('')
  const [page,setPage] = useState(1)
  const [leaveId,setLeaveId] = useState<number | null>(null)
  const branches = useLoad<{ branches: { id:number; name:string }[] }>(can(me,'branches.view') ? '/branches' : null)
  const leaves = useLoad<{ requests: Leave[] }>(category==='leaves' ? '/leaves' : null)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useLoad<{ messages: Summary[]; unread: number; has_more: boolean }>(category==='leaves' ? null : `/messages?folder=${folder}&page=${page}${branch ? '&branch_id='+branch : ''}${category ? '&kind='+category : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`)
  const [draft, setDraft] = useState<Draft | null>(null)
  const selectedLeave = leaves.data?.requests.find(r=>r.id===leaveId)
  const filters = [['leaves','طلبات إجازة وإذن'],['fault','بلاغات أعطال'],['collection','تقارير تحصيل'],['circular','تعميمات']] as const
  const selectCategory = (value: typeof category) => { setLeaveId(null); setPage(1); navigate(value ? '/messages?folder='+value : '/messages') }

  useEffect(() => { if (data) setUnread(data.unread) }, [data])
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  return (
    <div className={`af-mail af-mail-workspace${id || selectedLeave ? ' reading' : ''}`} dir="rtl">
      <PageHead title="المراسلات" />
      <div className="af-mail-body">
        <aside className="card glass af-mail-categories" aria-label="تصنيفات المراسلات">
          <Button variant="primary" block icon={<PenLine size={18} />} onClick={() => setDraft({ kind: 'message' })}>رسالة جديدة</Button>
          {me.branch && <Button onClick={()=>setRequesting(true)}>طلب إجازة أو إذن</Button>}
          {FOLDERS.map(([f,label,Icon])=><button className="af-mail-filter" type="button" key={f} aria-pressed={folder===f && !category} onClick={()=>{setFolder(f);selectCategory('')}}><Icon size={16}/>{label}{f==='inbox' && <span className="af-count">{data?.unread ?? 0}</span>}</button>)}
          <span className="af-sub">تصنيفات العمل</span>
          {filters.map(([value,label])=><button className="af-mail-filter" type="button" key={value} aria-pressed={category===value} onClick={()=>{setFolder('inbox');selectCategory(value)}}>{label}</button>)}
        </aside>
        <aside className="card glass af-mail-list">
          <div className="af-search"><Search size={17} aria-hidden="true" /><input className="input" placeholder="ابحث في الرسائل" value={search} maxLength={80} onChange={(e) => {setSearch(e.target.value);setPage(1)}} aria-label="بحث" /></div>
          <ChoiceField className="input select" aria-label="فلتر الفرع" value={branch} onChange={e=>{setBranch(e.target.value);setPage(1);selectCategory(category)}}>
            <option value="">كل الفروع المتاحة</option>{(branches.data?.branches ?? (me.branch ? [me.branch] : [])).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </ChoiceField>
          <ErrorBanner text={category==='leaves' ? leaves.error : error} />
          {category==='leaves' ? <div className="af-mail-items">
            {leaves.data?.requests.filter(r=>(!branch || r.branch_id===Number(branch)) && (!q || [r.name,r.reason,leaveKind[r.kind]].some(value=>value.includes(q)))).map(r=>
              <button className="af-mail-item" type="button" key={r.id} data-active={r.id===leaveId || undefined} data-unread={!r.read || undefined} onClick={()=>{
                setLeaveId(r.id)
                if (!r.read) void api(`/leaves/${r.id}/read`,{method:'POST'}).then(()=>leaves.reload()).catch(()=>undefined)
              }}>
                <Avatar name={r.name} size={38}/><span className="af-mail-text"><b>{r.name}</b><span>{leaveKind[r.kind]}</span><small>{leaveStatus[r.status]}</small></span>
              </button>)}
            {!leaves.loading && !leaves.data?.requests.length && <p>لا توجد طلبات.</p>}
          </div> : <>
          {loading && !data ? <Loading /> : (
            <div className="af-mail-items">
              {data?.messages.map((m) => (
                <button key={m.id} type="button" className="af-mail-item" data-unread={!m.read || undefined} data-active={String(m.id) === id || undefined}
                  onClick={() => navigate(`/messages/${m.id}`)}>
                  <Avatar name={folder === 'sent' ? (m.to || '؟') : (m.sender?.name ?? '؟')} size={40} />
                  <span className="af-mail-text">
                    <span className="af-mail-top"><b>{folder === 'sent' ? `إلى: ${m.to}${m.recipients_count > 3 ? ` و${m.recipients_count - 3} آخرين` : ''}` : m.sender?.name}</b><small>{when(m.created_at)}</small></span>
                    <span className="af-mail-subject">{m.kind !== 'message' && <span className={`af-kind ${m.kind}`}><KindIcon kind={m.kind} />{KIND[m.kind].label}</span>}{m.subject}{m.has_attachments && <Paperclip size={13} />}</span>
                    <span className="af-mail-preview">{m.preview}</span>
                  </span>
                </button>
              ))}
              {data?.messages.length === 0 && (
                <div className="af-mail-empty"><Mail size={30} /><p>{q ? 'لا توجد نتائج.' : folder === 'inbox' ? 'صندوق الوارد فارغ.' : folder === 'sent' ? 'لم ترسل رسائل بعد.' : 'الأرشيف فارغ.'}</p></div>
              )}
            </div>
          )}
          {((data?.has_more ?? false) || page>1) && <div className="af-toolbar"><Button disabled={page===1} onClick={()=>setPage(page-1)}>السابق</Button><Button disabled={!data?.has_more} onClick={()=>setPage(page+1)}>التالي</Button></div>}
          </>}
        </aside>

        <section className="card glass af-mail-read">
          {category==='leaves' && selectedLeave ? <LeaveDetails key={selectedLeave.id} leave={selectedLeave} back={()=>setLeaveId(null)} reload={leaves.reload} /> : id ? <Conversation key={id} id={id} onReply={setDraft} onChanged={() => void reload()} /> : (
            <div className="af-mail-empty big"><MailOpen size={44} /><p>اختر رسالة لقراءتها</p></div>
          )}
        </section>
      </div>

      {requesting && <Dialog open title="طلب إجازة أو إذن" onClose={()=>setRequesting(false)}><LeaveRequestForm onSent={()=>{setRequesting(false);selectCategory('leaves');void leaves.reload()}}/></Dialog>}
      {draft && <Compose draft={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); setFolder('sent'); selectCategory(''); void reload() }} />}
    </div>
  )
}

function Conversation({ id, onReply, onChanged }: { id: string; onReply(d: Draft): void; onChanged(): void }) {
  const me = useUser()
  const toast = useToast()
  const navigate = useNavigate()
  const [reply,setReply] = useState('')
  const [channel,setChannel] = useState<'system'|'sms'>('system')
  const [sending,setSending] = useState(false)
  const { data, error, loading, setData, reload } = useLoad<{ thread: Full[]; current_id: number; archived: boolean; unread: number; sms_enabled: boolean }>(`/messages/${id}`)
  useEffect(() => { if (data) { setUnread(data.unread); onChanged() } }, [data?.current_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const last = data.thread[data.thread.length - 1]!
  const first = data.thread[0]!
  const others = (m: Full) => [m.sender, ...m.recipients].filter((p): p is { id: number; name: string } => !!p && p.id !== me.id)
  const uniq = (list: Array<{ id: number; name: string }>) => list.filter((p, i) => list.findIndex((x) => x.id === p.id) === i)
  const replySubject = first.subject.startsWith('رد:') ? first.subject : `رد: ${first.subject}`
  const isRecipient = last.sender?.id !== me.id

  async function toggleArchive() {
    try {
      await api(`/messages/${data!.current_id}/archive`, { method: 'POST', body: { archive: !data!.archived } })
      toast(data!.archived ? 'أُعيدت إلى الوارد' : 'نُقلت إلى الأرشيف')
      setData({ ...data!, archived: !data!.archived })
      onChanged()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'حدث خطأ', 'danger') }
  }

  const target = last.sender && last.sender.id !== me.id ? last.sender : others(last)[0]
  async function sendQuickReply() {
    if (!target || !reply.trim() || sending) return
    setSending(true)
    try {
      if (channel === 'sms') {
        await api(`/messages/${last.id}/sms`,{method:'POST',body:{to:target.id,body:reply.trim()}})
        toast('استلم مزوّد الرسائل طلب الإرسال')
      } else {
        await api('/messages',{method:'POST',body:{to:[target.id],subject:replySubject,body:reply.trim(),reply_to:last.id}})
        await reload()
        onChanged()
        toast('أُرسل الرد داخل النظام')
      }
      setReply('')
    } catch(e) {
      toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر إرسال الرد','danger')
    } finally { setSending(false) }
  }
  return (
    <div className="af-conv">
      <header className="af-conv-head">
        <button type="button" className="icon-btn af-back" aria-label="رجوع إلى القائمة" onClick={() => navigate('/messages')}><ArrowRight size={18} /></button>
        <h2>{first.subject}</h2>
        {isRecipient && <button type="button" className="icon-btn" title={data.archived ? 'إعادة إلى الوارد' : 'أرشفة'} aria-label={data.archived ? 'إعادة إلى الوارد' : 'أرشفة'} onClick={() => void toggleArchive()}>{data.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>}
      </header>
      <div className="af-conv-list">
        {data.thread.map((m) => <MessageCard key={m.id} m={m} mine={m.sender?.id === me.id} />)}
      </div>
      <footer className="af-conv-actions">
        {uniq(data.thread.flatMap(others)).length > 1 && (
          <Button icon={<ReplyAll size={18} />} onClick={() => onReply({ kind: 'message', replyTo: last.id, subject: replySubject, to: uniq(data.thread.flatMap(others)) })}>رد على الجميع</Button>
        )}
        {me.role?.key !== 'employee' && (
          <Button icon={<Forward size={18} />} onClick={() => onReply({ kind: 'message', forwardOf: last, subject: `رفع: ${last.subject}`, body: 'للاطلاع والإفادة.' })}>رفع / تحويل</Button>
        )}
      </footer>
      {target && <form className="af-inline-reply" onSubmit={e=>{e.preventDefault();void sendQuickReply()}}>
        <label>رد سريع إلى {target.name}<textarea className="input textarea" rows={3} value={reply} maxLength={channel==='sms'?480:20000} onChange={e=>setReply(e.target.value)} /></label>
        <div className="af-toolbar"><ChoiceField className="input select" aria-label="قناة الإرسال" value={channel} onChange={e=>setChannel(e.target.value as 'system'|'sms')}>
          <option value="system">إرسال داخل النظام</option><option value="sms" disabled={!data.sms_enabled}>{data.sms_enabled ? 'رسالة قصيرة SMS' : 'خدمة SMS بحاجة إلى إعداد'}</option>
        </ChoiceField><Button type="submit" variant="send" icon={<Send size={16}/>} busy={sending} disabled={!reply.trim() || (channel==='sms' && reply.length>480)}>إرسال الرد</Button></div>
      </form>}
    </div>
  )
}

function MessageCard({ m, mine }: { m: Full; mine: boolean }) {
  const toast = useToast()
  return (
    <article className="af-msg" data-mine={mine || undefined}>
      <header>
        <Avatar name={m.sender?.name ?? '؟'} size={36} />
        <span><b>{m.sender?.name}</b><small>إلى: {m.groups_label ?? m.recipients.map((r) => r.name).join('، ')}{m.recipients_count > m.recipients.length ? ` و${m.recipients_count - m.recipients.length} آخرين` : ''}</small></span>
        <time>{fullWhen(m.created_at)}</time>
      </header>
      {m.kind !== 'message' && (
        <div className={`af-request ${m.kind}`}>
          <KindIcon kind={m.kind} /> <b>{KIND[m.kind].label}</b>
          {m.kind === 'leave_request' && m.meta?.from && <span>من <b className="num">{m.meta.from}</b>{m.meta.to ? <> إلى <b className="num">{m.meta.to}</b></> : null}</span>}
          {m.kind === 'permission_request' && m.meta?.date && <span>يوم <b className="num">{m.meta.date}</b>{m.meta.from_time ? <> من <b className="num">{m.meta.from_time}</b></> : null}{m.meta.to_time ? <> إلى <b className="num">{m.meta.to_time}</b></> : null}</span>}
        </div>
      )}
      <p className="af-msg-body">{m.body}</p>
      {m.has_account_handoff && <AccountHandoff messageId={m.id}/>}
      {m.attachments.length > 0 && (
        <div className="af-files">
          {m.attachments.map((a) => (
            <button key={a.id} type="button" className="af-chip-person file" onClick={() => void openFile(`/messages/${m.id}/attachments/${a.id}`).catch((e) => toast(e.message, 'danger'))}>
              <Paperclip size={14} />{a.name}
            </button>
          ))}
        </div>
      )}
      {m.forwarded && (
        <div className="af-quote">
          <small>رسالة مرفوعة من {m.forwarded.sender?.name} · {fullWhen(m.forwarded.created_at)}</small>
          <MessageCard m={m.forwarded} mine={false} />
        </div>
      )}
      {mine && m.recipients.length > 0 && <small className="af-sub">{m.recipients.every((r) => r.read) ? 'قرأها الجميع' : `قرأها ${m.recipients.filter((r) => r.read).length} من ${m.recipients.length}`}</small>}
      {(m.kind==='leave_request'||m.kind==='permission_request') && !mine && <Link to="/messages?folder=leaves">فتح سجل الإجازات والأذونات</Link>}
    </article>
  )
}

const leaveKind = { annual:'إجازة سنوية', sick:'إجازة مرضية', other:'إجازة أخرى', permission:'إذن بالساعات' }
const leaveStatus = { pending:'بانتظار شؤون الموظفين', escalated:'محال إلى الإدارة', approved:'معتمد', rejected:'مرفوض', cancelled:'ملغى' }
type Leave = {id:number; read:number; user_id:number; branch_id:number; name:string; reason:string; starts:string; ends:string; kind:keyof typeof leaveKind; status:keyof typeof leaveStatus; days:number; from_time:string|null; to_time:string|null}

function LeaveDetails({leave,back,reload}:{leave:Leave;back():void;reload():Promise<void>}) {
  const user=useUser()
  const toast=useToast()
  const [busy,setBusy]=useState(false)
  const hr=user.role?.key==='hr'
  const review=leave.user_id!==user.id && ((hr && leave.status==='pending') || (user.role?.key==='management' && leave.status==='escalated'))
  async function decide(action:string) {
    setBusy(true)
    try { await api(`/leaves/${leave.id}`,{method:'PATCH',body:{action}}); await reload(); toast('حُفظ القرار') }
    catch(e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر حفظ القرار','danger') }
    finally { setBusy(false) }
  }
  return <div className="af-conv">
    <header className="af-conv-head"><button type="button" className="icon-btn af-back" aria-label="رجوع إلى القائمة" onClick={back}><ArrowRight size={18}/></button><h2>{leaveKind[leave.kind]}</h2></header>
    <article className="af-pad"><h3>{leave.name}</h3><Pill tone="info">{leaveStatus[leave.status]}</Pill>
      <p>{leave.starts}{leave.starts!==leave.ends && ` – ${leave.ends}`}</p>
      <p>{leave.kind==='permission' ? `${leave.from_time?.slice(0,5)} – ${leave.to_time?.slice(0,5)}` : `${leave.days} يوم دوام`}</p>
      <p className="af-msg-body">{leave.reason}</p>
    </article>
    {review && <footer className="af-conv-actions"><Button disabled={busy} variant="primary" onClick={()=>decide('approved')}>موافقة</Button><Button disabled={busy} onClick={()=>decide('rejected')}>رفض</Button>{hr && <Button disabled={busy} onClick={()=>decide('escalated')}>إحالة للإدارة</Button>}</footer>}
     {((leave.user_id===user.id && ['pending','escalated'].includes(leave.status)) || (hr && leave.status==='approved')) && <Button disabled={busy} onClick={()=>decide('cancelled')}>إلغاء الطلب</Button>}
  </div>
}
