import { AccountHandoff } from '../AccountHandoff'
import { LeaveRequestForm } from './LeaveRequestForm'
import { Dialog } from '../../ui/Dialog'
import { ChoiceField } from '../../ui/ChoiceField'
import { Archive, ArchiveRestore, Inbox as InboxIcon, ArrowRight, CalendarDays, CalendarPlus, Check, Clock, Forward, Mail, MailOpen, Paperclip, PenLine, ReplyAll, Search, Send, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, openFile } from '../../api/client'
import { can, scopeOf, useUser } from '../../app/auth'
import { describeDay } from '../../lib/dates'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner } from '../../ui/Field'
import { Loading } from '../../ui/PageHead'
import { Button } from '../../ui/primitives'
import { NxAvatar, NxEmpty, type Hue } from '../../ui/nx'
import { useToast } from '../../ui/Toast'
import { Compose, KindIcon, type Draft } from './Compose'
import { fullWhen, KIND, setUnread, when, type Full, type Summary, type Kind } from './lib'

type Tab = 'inbox' | 'sent' | 'archive' | 'leaves'
const KINDS: Array<[Kind | '', string]> = [['', 'الكل'], ['message', 'رسائل'], ['fault', 'بلاغات أعطال'], ['collection', 'تقارير تحصيل'], ['circular', 'تعميمات']]

/** Internal mail and leave requests: tabs on top, the list on one side, the reading pane on the other. */
export function Inbox() {
  const { id } = useParams()
  const navigate = useNavigate()
  const me = useUser()
  const [params, setParams] = useSearchParams()
  const tab = (['sent', 'archive', 'leaves'].includes(params.get('folder') ?? '') ? params.get('folder') : 'inbox') as Tab
  const [kind, setKind] = useState<Kind | ''>('')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [leaveId, setLeaveId] = useState<number | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const wide = scopeOf(me, 'branches.view') === 'all'
  const branches = useLoad<{ branches: { id: number; name: string }[] }>(wide ? '/branches' : null)
  const leaves = useLoad<{ requests: Leave[] }>('/leaves')
  const mail = tab === 'leaves' ? null : `/messages?folder=${tab}&page=${page}${branch ? '&branch_id=' + branch : ''}${kind ? '&kind=' + kind : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`
  const { data, error, loading, reload } = useLoad<{ messages: Summary[]; unread: number; has_more: boolean }>(mail)
  const decider = can(me, 'leaves.decide') || can(me, 'leaves.final')
  const waiting = (leaves.data?.requests ?? []).filter((r) => r.user_id !== me.id && (r.status === 'pending' || (r.status === 'escalated' && can(me, 'leaves.final')))).length
  const leaveRows = (leaves.data?.requests ?? []).filter((r) => (!branch || r.branch_id === Number(branch)) && (!q || [r.name, r.reason, LEAVE_KIND[r.kind]].some((v) => v.includes(q))))
  const selectedLeave = leaves.data?.requests.find((r) => r.id === leaveId)

  useEffect(() => { if (data) setUnread(data.unread) }, [data])
  useEffect(() => { const t = window.setTimeout(() => setQ(search.trim()), 300); return () => window.clearTimeout(t) }, [search])

  function openTab(next: Tab) {
    setPage(1); setLeaveId(null)
    setParams(next === 'inbox' ? {} : { folder: next }, { replace: true })
    if (id) navigate(next === 'inbox' ? '/messages' : `/messages?folder=${next}`)
  }

  const reading = !!id || (tab === 'leaves' && !!selectedLeave)
  const folders = [
    { key: 'inbox' as const, label: 'الوارد', icon: InboxIcon, n: tab === 'inbox' ? data?.unread ?? 0 : 0 },
    { key: 'sent' as const, label: 'المرسل', icon: Send, n: 0 },
    { key: 'archive' as const, label: 'الأرشيف', icon: Archive, n: 0 },
  ]
  const listTitle = tab === 'leaves' ? (decider ? 'طلبات الإجازة' : 'إجازاتي') : kind ? KIND[kind].label : folders.find((f) => f.key === tab)?.label
  const listCount = tab === 'leaves' ? leaveRows.length : data?.messages.length ?? 0
  return (
    <div className={`nx nxm${reading ? ' reading' : ''}`}>
      <div className="nxm-window">
        <nav className="nxm-folders" aria-label="المجلدات">
          <div className="nxm-brand"><span className="nx-ico" data-hue="rose"><Mail size={19} /></span><span><b>المراسلات</b><small>رسائل العمل والإجازات</small></span></div>
          <button type="button" className="nxm-compose" onClick={() => setDraft({ kind: 'message' })}><PenLine size={18} /> رسالة جديدة</button>
          <div className="nxm-group">
            {folders.map(({ key, label, icon: Icon, n }) => (
              <button key={key} type="button" className="nxm-folder" aria-current={tab === key && !kind ? 'page' : undefined} onClick={() => { setKind(''); openTab(key) }}>
                <Icon size={18} /><span>{label}</span>{n > 0 && <span className="nxm-n num">{n}</span>}
              </button>
            ))}
          </div>
          <div className="nxm-group">
            <span className="nxm-group-label">الإجازات</span>
            <button type="button" className="nxm-folder" aria-current={tab === 'leaves' ? 'page' : undefined} onClick={() => openTab('leaves')}>
              <CalendarDays size={18} /><span>{decider ? 'طلبات الإجازة' : 'إجازاتي'}</span>{waiting > 0 && <span className="nxm-n num">{waiting}</span>}
            </button>
            {me.branch && <button type="button" className="nxm-folder nxm-soft" onClick={() => setRequesting(true)}><CalendarPlus size={18} /><span>طلب إجازة أو إذن</span></button>}
          </div>
          <div className="nxm-group">
            <span className="nxm-group-label">التصنيفات</span>
            {KINDS.filter(([k]) => k && k !== 'message').map(([k, label]) => (
              <button key={k} type="button" className="nxm-folder" aria-current={tab !== 'leaves' && kind === k ? 'page' : undefined} onClick={() => { if (tab === 'leaves') openTab('inbox'); setKind(kind === k ? '' : k as Kind); setPage(1) }}>
                <i className="nxm-dot" data-hue={KIND_HUE[k as Kind]} /><span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        <aside className="nxm-list" aria-label="القائمة">
          <header className="nxm-list-head">
            <div className="nxm-list-title"><h2>{listTitle}</h2>{!!listCount && <span className="num">{listCount}</span>}
              {tab !== 'leaves' && kind && <button type="button" className="nxm-link" onClick={() => setKind('')}>عرض الكل</button>}</div>
            <label className="nxm-search"><Search size={17} aria-hidden="true" /><input placeholder={tab === 'leaves' ? 'ابحث باسم الموظف أو السبب' : 'ابحث في الرسائل'} value={search} maxLength={80} onChange={(e) => { setSearch(e.target.value); setPage(1) }} aria-label="بحث" /></label>
            {wide && (
              <ChoiceField className="input select nxm-branch" aria-label="الفرع" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1) }}>
                <option value="">كل الفروع</option>{branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </ChoiceField>
            )}
          </header>

          {tab === 'leaves' ? (
            <div className="nxm-items">
              <ErrorBanner text={leaves.error} />
              {leaves.loading && !leaves.data ? <Loading /> : leaveRows.map((r) => {
                const st = LEAVE_STATUS[r.status] ?? LEAVE_STATUS.pending!
                return (
                  <button key={r.id} type="button" className="nxm-item" data-active={r.id === leaveId || undefined} data-unread={(!r.read && r.user_id !== me.id) || undefined}
                    onClick={() => { setLeaveId(r.id); if (!r.read) void api(`/leaves/${r.id}/read`, { method: 'POST' }).then(() => leaves.reload()).catch(() => undefined) }}>
                    <NxAvatar name={r.name} size={42} />
                    <span className="nxm-text">
                      <span className="nxm-top"><b>{r.user_id === me.id ? 'طلبي' : r.name}</b><span className="nx-chip" data-hue={st.hue}>{st.label}</span></span>
                      <span className="nxm-subject">{r.kind === 'permission' ? <Clock size={14} /> : <CalendarDays size={14} />}{LEAVE_KIND[r.kind]}</span>
                      <span className="nxm-preview">{range(r)}</span>
                    </span>
                  </button>
                )
              })}
              {!leaves.loading && leaveRows.length === 0 && <NxEmpty icon={<CalendarDays size={26} />} title={q ? 'لا توجد نتائج' : decider ? 'لا توجد طلبات إجازة' : 'لم تقدّم أي طلب بعد'} />}
            </div>
          ) : (
            <div className="nxm-items">
              <ErrorBanner text={error} />
              {loading && !data ? <Loading /> : data?.messages.map((m) => {
                const who = tab === 'sent' ? (m.to || '؟') : (m.sender?.name ?? '؟')
                return (
                  <button key={m.id} type="button" className="nxm-item" data-unread={!m.read || undefined} data-active={String(m.id) === id || undefined}
                    onClick={() => navigate(`/messages/${m.id}${tab === 'inbox' ? '' : `?folder=${tab}`}`)}>
                    <NxAvatar name={who} size={42} />
                    <span className="nxm-text">
                      <span className="nxm-top"><b>{tab === 'sent' ? `إلى: ${m.to}${m.recipients_count > 3 ? ` و${m.recipients_count - 3} آخرين` : ''}` : m.sender?.name}</b><small className="num">{when(m.created_at)}</small></span>
                      <span className="nxm-subject">{m.subject}{m.has_attachments && <Paperclip size={13} />}</span>
                      <span className="nxm-preview">{m.preview}</span>
                      {m.kind !== 'message' && <span className="nx-chip nxm-kind" data-hue={KIND_HUE[m.kind]}>{KIND[m.kind].label}</span>}
                    </span>
                  </button>
                )
              })}
              {data?.messages.length === 0 && <NxEmpty icon={<Mail size={26} />} title={q || kind ? 'لا توجد رسائل تطابق البحث' : tab === 'inbox' ? 'صندوق الوارد فارغ' : tab === 'sent' ? 'لم ترسل رسائل بعد' : 'الأرشيف فارغ'} />}
              {((data?.has_more ?? false) || page > 1) && (
                <div className="nxm-pages"><Button className="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>الأحدث</Button><span className="num">صفحة {page}</span><Button className="sm" disabled={!data?.has_more} onClick={() => setPage(page + 1)}>الأقدم</Button></div>
              )}
            </div>
          )}
        </aside>

        <section className="nxm-read" aria-label="القراءة">
          {tab === 'leaves' && selectedLeave ? <LeaveCard key={selectedLeave.id} leave={selectedLeave} back={() => setLeaveId(null)} reload={leaves.reload} />
            : id ? <Conversation key={id} id={id} back={() => navigate(tab === 'inbox' ? '/messages' : `/messages?folder=${tab}`)} onReply={setDraft} onChanged={() => void reload()} />
            : <div className="nxm-welcome">
                <span className="nxm-welcome-art">{tab === 'leaves' ? <CalendarDays size={40} /> : <MailOpen size={40} />}</span>
                <h3>{tab === 'leaves' ? 'اختر طلباً لعرض تفاصيله' : 'اختر رسالة لقراءتها'}</h3>
                <p>{tab === 'leaves' ? 'تظهر هنا تفاصيل الطلب وأزرار القرار.' : data?.unread ? `لديك ${data.unread} ${data.unread === 1 ? 'رسالة' : 'رسائل'} لم تُقرأ بعد.` : 'قرأت كل رسائلك.'}</p>
                <button type="button" className="nxm-compose nxm-compose-ghost" onClick={() => setDraft({ kind: 'message' })}><PenLine size={17} /> كتابة رسالة</button>
              </div>}
        </section>
      </div>

      {requesting && <Dialog open title="طلب إجازة أو إذن" subtitle="يصل الطلب إلى شؤون الموظفين للقرار" icon={<CalendarPlus size={20} />} onClose={() => setRequesting(false)}>
        <LeaveRequestForm onSent={() => { setRequesting(false); openTab('leaves'); void leaves.reload() }} />
      </Dialog>}
      {draft && <Compose draft={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); openTab('sent'); void reload() }} />}
    </div>
  )
}

function Conversation({ id, back, onReply, onChanged }: { id: string; back(): void; onReply(d: Draft): void; onChanged(): void }) {
  const me = useUser()
  const toast = useToast()
  const [reply, setReply] = useState('')
  const [channel, setChannel] = useState<'system' | 'sms'>('system')
  const [sending, setSending] = useState(false)
  const { data, error, loading, setData, reload } = useLoad<{ thread: Full[]; current_id: number; archived: boolean; unread: number; sms_enabled: boolean }>(`/messages/${id}`)
  useEffect(() => { if (data) { setUnread(data.unread); onChanged() } }, [data?.current_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />
  if (!data) return <ErrorBanner text={error} />
  const last = data.thread[data.thread.length - 1]!
  const first = data.thread[0]!
  const others = (m: Full) => [m.sender, ...m.recipients].filter((p): p is { id: number; name: string } => !!p && p.id !== me.id)
  const people = data.thread.flatMap(others).filter((p, i, list) => list.findIndex((x) => x.id === p.id) === i)
  const replySubject = first.subject.startsWith('رد:') ? first.subject : `رد: ${first.subject}`
  const isRecipient = last.sender?.id !== me.id
  const target = last.sender && last.sender.id !== me.id ? last.sender : others(last)[0]

  async function toggleArchive() {
    try {
      await api(`/messages/${data!.current_id}/archive`, { method: 'POST', body: { archive: !data!.archived } })
      toast(data!.archived ? 'أُعيدت إلى الوارد' : 'نُقلت إلى الأرشيف')
      setData({ ...data!, archived: !data!.archived })
      onChanged()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'تعذّر تنفيذ العملية.', 'danger') }
  }

  async function sendReply() {
    if (!target || !reply.trim() || sending) return
    setSending(true)
    try {
      if (channel === 'sms') {
        await api(`/messages/${last.id}/sms`, { method: 'POST', body: { to: target.id, body: reply.trim() } })
        toast('أُرسلت الرسالة القصيرة')
      } else {
        await api('/messages', { method: 'POST', body: { to: [target.id], subject: replySubject, body: reply.trim(), reply_to: last.id } })
        await reload()
        onChanged()
        toast('أُرسل الرد')
      }
      setReply('')
    } catch (e) {
      toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر إرسال الرد.', 'danger')
    } finally { setSending(false) }
  }

  return (
    <div className="nxm-conv">
      <header className="nxm-head">
        <button type="button" className="nx-icon-btn nxm-back" aria-label="رجوع إلى القائمة" onClick={back}><ArrowRight size={18} /></button>
        <div className="nxm-head-title">
          <h2>{first.subject}</h2>
          <small>{first.kind !== 'message' && <span className="nx-chip" data-hue={KIND_HUE[first.kind]}>{KIND[first.kind].label}</span>}{data.thread.length > 1 ? `${data.thread.length} رسائل في المحادثة` : fullWhen(first.created_at)}</small>
        </div>
        <div className="nxm-head-actions">
          {people.length > 1 && <Button className="sm" icon={<ReplyAll size={16} />} onClick={() => onReply({ kind: 'message', replyTo: last.id, subject: replySubject, to: people })}>رد على الجميع</Button>}
          {me.role?.key !== 'employee' && <Button className="sm" icon={<Forward size={16} />} onClick={() => onReply({ kind: 'message', forwardOf: last, subject: `رفع: ${last.subject}`, body: 'للاطلاع والإفادة.' })}>تحويل</Button>}
          {isRecipient && <button type="button" className="nx-icon-btn nxm-arch" title={data.archived ? 'إعادة إلى الوارد' : 'نقل إلى الأرشيف'} aria-label={data.archived ? 'إعادة إلى الوارد' : 'نقل إلى الأرشيف'} onClick={() => void toggleArchive()}>{data.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>}
        </div>
      </header>
      <div className="nxm-thread">
        {data.thread.map((m) => <MessageCard key={m.id} m={m} mine={m.sender?.id === me.id} />)}
      </div>
      {target && (
        <form className="nxm-reply" onSubmit={(e) => { e.preventDefault(); void sendReply() }}>
          <NxAvatar name={me.name} size={36} />
          <textarea rows={2} value={reply} maxLength={channel === 'sms' ? 480 : 20000} placeholder={`اكتب رداً إلى ${target.name}…`} aria-label={`رد إلى ${target.name}`}
            onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendReply() } }} />
          <div className="nxm-reply-bar">
            {data.sms_enabled && (
              <ChoiceField className="input select" aria-label="طريقة الإرسال" value={channel} onChange={(e) => setChannel(e.target.value as 'system' | 'sms')}>
                <option value="system">داخل النظام</option><option value="sms">رسالة قصيرة SMS</option>
              </ChoiceField>
            )}
            <Button type="submit" variant="primary" className="nxm-send" icon={<Send size={16} />} busy={sending} disabled={!reply.trim() || (channel === 'sms' && reply.length > 480)}>إرسال</Button>
          </div>
        </form>
      )}
    </div>
  )
}

function MessageCard({ m, mine }: { m: Full; mine: boolean }) {
  const toast = useToast()
  return (
    <article className="nxm-msg" data-mine={mine || undefined}>
      <header>
        <NxAvatar name={m.sender?.name ?? '؟'} size={40} />
        <span><b>{mine ? 'أنت' : m.sender?.name}</b><small>إلى: {m.groups_label ?? m.recipients.map((r) => r.name).join('، ')}{m.recipients_count > m.recipients.length ? ` و${m.recipients_count - m.recipients.length} آخرين` : ''}</small></span>
        <time className="num">{fullWhen(m.created_at)}</time>
      </header>
      {(m.kind === 'leave_request' || m.kind === 'permission_request') && (
        <div className={`af-request ${m.kind}`}>
          <KindIcon kind={m.kind} /> <b>{KIND[m.kind].label}</b>
          {m.kind === 'leave_request' && m.meta?.from && <span>من <b className="num">{m.meta.from}</b>{m.meta.to ? <> إلى <b className="num">{m.meta.to}</b></> : null}</span>}
          {m.kind === 'permission_request' && m.meta?.date && <span>يوم <b className="num">{m.meta.date}</b>{m.meta.from_time ? <> من <b className="num">{m.meta.from_time}</b></> : null}{m.meta.to_time ? <> إلى <b className="num">{m.meta.to_time}</b></> : null}</span>}
        </div>
      )}
      <p className="nxm-body">{m.body}</p>
      {m.has_account_handoff && <AccountHandoff messageId={m.id} />}
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
      {mine && m.recipients.length > 0 && <small className="af-sub msg-read-state">{m.recipients.every((r) => r.read) ? <><Check size={13} /> قرأها الجميع</> : `قرأها ${m.recipients.filter((r) => r.read).length} من ${m.recipients.length}`}</small>}
    </article>
  )
}

const LEAVE_KIND = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', other: 'إجازة أخرى', permission: 'إذن بالساعات' }
const LEAVE_STATUS: Record<string, { label: string; hue: Hue }> = {
  pending: { label: 'بانتظار القرار', hue: 'amber' }, escalated: { label: 'عند الإدارة', hue: 'violet' }, approved: { label: 'موافق عليه', hue: 'mint' },
  rejected: { label: 'مرفوض', hue: 'rose' }, cancelled: { label: 'ملغى', hue: 'slate' },
}
const KIND_HUE: Record<Kind, Hue> = { message: 'slate', fault: 'amber', collection: 'mint', circular: 'sky', leave_request: 'violet', permission_request: 'violet' }
type Leave = { id: number; read: number; user_id: number; branch_id: number; name: string; reason: string; starts: string; ends: string; kind: keyof typeof LEAVE_KIND; status: string; days: number; from_time: string | null; to_time: string | null }

const day = (iso: string) => { const d = describeDay(iso); return `${d.weekday} ${d.date}` }
/** Short, for the list: «السبت 28 نوفمبر», no year. */
const dayShort = (iso: string) => { const d = describeDay(iso); return `${d.weekday} ${d.date.replace(/ \d{4}$/, '')}` }
function range(r: Leave): string {
  if (r.kind === 'permission') return `${dayShort(r.starts)} · ${r.from_time?.slice(0, 5)}–${r.to_time?.slice(0, 5)}`
  return r.starts === r.ends ? `${dayShort(r.starts)} · يوم واحد` : `${dayShort(r.starts)} ← ${dayShort(r.ends)} · ${r.days} ${r.days === 1 ? 'يوم' : r.days <= 10 ? 'أيام' : 'يوماً'}`
}

/** One leave request: who, what, when, why, where it stands, and the decision buttons for whoever decides. */
function LeaveCard({ leave, back, reload }: { leave: Leave; back(): void; reload(): Promise<void> }) {
  const user = useUser()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const mine = leave.user_id === user.id
  const hr = can(user, 'leaves.decide')
  const review = !mine && ((hr && leave.status === 'pending') || (can(user, 'leaves.final') && leave.status === 'escalated'))
  const cancel = (mine && ['pending', 'escalated'].includes(leave.status)) || (hr && !mine && leave.status === 'approved')

  async function decide(action: 'approved' | 'rejected' | 'escalated' | 'cancelled') {
    const words: [string, string] = ({ approved: ['الموافقة على الطلب؟', 'موافقة'], rejected: ['رفض الطلب؟', 'رفض'], escalated: ['إحالة الطلب إلى الإدارة؟', 'إحالة'], cancelled: ['إلغاء الطلب؟', 'إلغاء الطلب'] } as Record<string, [string, string]>)[action]!
    if (!(await confirm({ title: words[0], confirmLabel: words[1], danger: action === 'rejected' || action === 'cancelled' }))) return
    setBusy(true)
    try { await api(`/leaves/${leave.id}`, { method: 'PATCH', body: { action } }); await reload(); toast('حُفظ القرار') }
    catch (e) { toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'تعذّر حفظ القرار.', 'danger') }
    finally { setBusy(false) }
  }

  return (
    <div className="nxm-conv">
      <header className="nxm-head">
        <button type="button" className="nx-icon-btn nxm-back" aria-label="رجوع إلى القائمة" onClick={back}><ArrowRight size={18} /></button>
        <div className="nxm-head-title"><h2>{LEAVE_KIND[leave.kind]}</h2><small>{mine ? 'طلبك' : leave.name}</small></div>
        <span className="nx-chip nx-chip-dot" data-hue={LEAVE_STATUS[leave.status]!.hue}>{LEAVE_STATUS[leave.status]!.label}</span>
      </header>
      <div className="nxm-leave">
        <div className="nxm-leave-who"><NxAvatar name={leave.name} size={56} /><span><b>{leave.name}</b><small>{LEAVE_KIND[leave.kind]}</small></span></div>
        <dl className="nxm-facts">
          <div><dt>{leave.kind === 'permission' ? 'اليوم' : 'من'}</dt><dd>{day(leave.starts)}</dd></div>
          {leave.kind === 'permission'
            ? <div><dt>الساعات</dt><dd className="num">{leave.from_time?.slice(0, 5)} – {leave.to_time?.slice(0, 5)}</dd></div>
            : <div><dt>إلى</dt><dd>{day(leave.ends)}</dd></div>}
          {leave.kind !== 'permission' && <div><dt>أيام الدوام</dt><dd className="num">{leave.days}</dd></div>}
        </dl>
        <div className="nxm-reason"><small>السبب</small><p>{leave.reason}</p></div>
        {review && (
          <div className="nxm-actions">
            <Button variant="primary" icon={<Check size={18} />} busy={busy} onClick={() => void decide('approved')}>موافقة</Button>
            <Button icon={<X size={18} />} disabled={busy} onClick={() => void decide('rejected')}>رفض</Button>
            {hr && leave.status === 'pending' && <Button variant="ghost" icon={<Forward size={18} />} disabled={busy} onClick={() => void decide('escalated')}>إحالة إلى الإدارة</Button>}
          </div>
        )}
        {cancel && <div className="nxm-actions"><Button variant="ghost" icon={<Undo2 size={18} />} disabled={busy} onClick={() => void decide('cancelled')}>إلغاء الطلب</Button></div>}
        {!review && !cancel && leave.status === 'pending' && !mine && <p className="nx-note">ينتظر قرار شؤون الموظفين.</p>}
      </div>
    </div>
  )
}

