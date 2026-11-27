import { AccountHandoff } from '../AccountHandoff'
import { LeaveRequestForm } from './LeaveRequestForm'
import { Dialog } from '../../ui/Dialog'
import { ChoiceField } from '../../ui/ChoiceField'
import { Archive, ArchiveRestore, ArrowRight, CalendarDays, CalendarPlus, Check, Clock, Forward, Mail, MailOpen, Paperclip, PenLine, ReplyAll, Search, Send, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, openFile } from '../../api/client'
import { can, scopeOf, useUser } from '../../app/auth'
import { describeDay } from '../../lib/dates'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../ui/Confirm'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
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
  return (
    <div className={`msg-page${reading ? ' reading' : ''}`}>
      <PageHead title="المراسلات" eyebrow="رسائل العمل وطلبات الإجازة في مكان واحد"
        actions={<>
          {me.branch && <Button icon={<CalendarPlus size={18} />} onClick={() => setRequesting(true)}>طلب إجازة أو إذن</Button>}
          <Button variant="primary" icon={<PenLine size={18} />} onClick={() => setDraft({ kind: 'message' })}>رسالة جديدة</Button>
        </>} />

      <div className="segmented msg-tabs" role="tablist" aria-label="أقسام المراسلات">
        {([['inbox', 'الوارد', data && tab === 'inbox' ? data.unread : 0], ['sent', 'المرسل', 0], ['archive', 'الأرشيف', 0], ['leaves', decider ? 'طلبات الإجازة' : 'إجازاتي', waiting]] as const).map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} aria-checked={tab === key} onClick={() => openTab(key)}>
            {label}{n > 0 && <span className="msg-count num">{n}</span>}
          </button>
        ))}
      </div>

      <div className="msg-layout">
        <aside className="card msg-list" aria-label="القائمة">
          <div className="msg-tools">
            <div className="af-search"><Search size={17} aria-hidden="true" /><input className="input" placeholder={tab === 'leaves' ? 'ابحث باسم الموظف أو السبب' : 'ابحث في الرسائل'} value={search} maxLength={80} onChange={(e) => { setSearch(e.target.value); setPage(1) }} aria-label="بحث" /></div>
            {wide && (
              <ChoiceField className="input select" aria-label="الفرع" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1) }}>
                <option value="">كل الفروع</option>{branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </ChoiceField>
            )}
          </div>
          {tab !== 'leaves' && (
            <div className="chips msg-kinds" role="group" aria-label="نوع الرسالة">
              {KINDS.map(([k, label]) => <button key={k || 'all'} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setPage(1) }}>{label}</button>)}
            </div>
          )}

          {tab === 'leaves' ? (
            <div className="msg-items">
              <ErrorBanner text={leaves.error} />
              {leaves.loading && !leaves.data ? <Loading /> : leaveRows.map((r) => (
                <button key={r.id} type="button" className="msg-item" data-active={r.id === leaveId || undefined} data-unread={(!r.read && r.user_id !== me.id) || undefined}
                  onClick={() => { setLeaveId(r.id); if (!r.read) void api(`/leaves/${r.id}/read`, { method: 'POST' }).then(() => leaves.reload()).catch(() => undefined) }}>
                  <Avatar name={r.name} size={40} />
                  <span className="msg-text">
                    <span className="msg-top"><b>{r.user_id === me.id ? 'طلبي' : r.name}</b><Pill tone={(LEAVE_STATUS[r.status] ?? LEAVE_STATUS.pending!).tone}>{(LEAVE_STATUS[r.status] ?? LEAVE_STATUS.pending!).label}</Pill></span>
                    <span className="msg-subject">{r.kind === 'permission' ? <Clock size={14} /> : <CalendarDays size={14} />}{LEAVE_KIND[r.kind]}</span>
                    <span className="msg-preview">{range(r)}</span>
                  </span>
                </button>
              ))}
              {!leaves.loading && leaveRows.length === 0 && <Empty icon={<CalendarDays size={30} />} text={q ? 'لا توجد نتائج.' : decider ? 'لا توجد طلبات إجازة.' : 'لم تقدّم أي طلب بعد. اضغط «طلب إجازة أو إذن».'} />}
            </div>
          ) : (
            <div className="msg-items">
              <ErrorBanner text={error} />
              {loading && !data ? <Loading /> : data?.messages.map((m) => (
                <button key={m.id} type="button" className="msg-item" data-unread={!m.read || undefined} data-active={String(m.id) === id || undefined}
                  onClick={() => navigate(`/messages/${m.id}${tab === 'inbox' ? '' : `?folder=${tab}`}`)}>
                  <Avatar name={tab === 'sent' ? (m.to || '؟') : (m.sender?.name ?? '؟')} size={40} />
                  <span className="msg-text">
                    <span className="msg-top"><b>{tab === 'sent' ? `إلى: ${m.to}${m.recipients_count > 3 ? ` و${m.recipients_count - 3} آخرين` : ''}` : m.sender?.name}</b><small className="num">{when(m.created_at)}</small></span>
                    <span className="msg-subject">{m.kind !== 'message' && <span className={`af-kind ${m.kind}`}><KindIcon kind={m.kind} />{KIND[m.kind].label}</span>}{m.subject}{m.has_attachments && <Paperclip size={13} />}</span>
                    <span className="msg-preview">{m.preview}</span>
                  </span>
                </button>
              ))}
              {data?.messages.length === 0 && <Empty icon={<Mail size={30} />} text={q || kind ? 'لا توجد رسائل تطابق البحث.' : tab === 'inbox' ? 'لا توجد رسائل واردة.' : tab === 'sent' ? 'لم ترسل رسائل بعد.' : 'الأرشيف فارغ.'} />}
              {((data?.has_more ?? false) || page > 1) && (
                <div className="msg-pages"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>الأحدث</Button><span className="num">صفحة {page}</span><Button disabled={!data?.has_more} onClick={() => setPage(page + 1)}>الأقدم</Button></div>
              )}
            </div>
          )}
        </aside>

        <section className="card msg-read" aria-label="القراءة">
          {tab === 'leaves' && selectedLeave ? <LeaveCard key={selectedLeave.id} leave={selectedLeave} back={() => setLeaveId(null)} reload={leaves.reload} />
            : id ? <Conversation key={id} id={id} back={() => navigate(tab === 'inbox' ? '/messages' : `/messages?folder=${tab}`)} onReply={setDraft} onChanged={() => void reload()} />
            : <Empty big icon={tab === 'leaves' ? <CalendarDays size={44} /> : <MailOpen size={44} />} text={tab === 'leaves' ? 'اختر طلباً لعرض تفاصيله' : 'اختر رسالة لقراءتها'} />}
        </section>
      </div>

      {requesting && <Dialog open title="طلب إجازة أو إذن" subtitle="يصل الطلب إلى شؤون الموظفين للقرار" icon={<CalendarPlus size={20} />} onClose={() => setRequesting(false)}>
        <LeaveRequestForm onSent={() => { setRequesting(false); openTab('leaves'); void leaves.reload() }} />
      </Dialog>}
      {draft && <Compose draft={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); openTab('sent'); void reload() }} />}
    </div>
  )
}

function Empty({ icon, text, big }: { icon: React.ReactNode; text: string; big?: boolean }) {
  return <div className={`msg-empty${big ? ' big' : ''}`}>{icon}<p>{text}</p></div>
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
    <div className="msg-conv">
      <header className="msg-conv-head">
        <button type="button" className="icon-btn msg-back" aria-label="رجوع إلى القائمة" onClick={back}><ArrowRight size={18} /></button>
        <div className="msg-conv-title">
          <h2>{first.subject}</h2>
          <small>{first.kind !== 'message' && <><Pill tone={KIND[first.kind].tone}>{KIND[first.kind].label}</Pill> </>}{data.thread.length > 1 ? `${data.thread.length} رسائل` : fullWhen(first.created_at)}</small>
        </div>
        <div className="msg-conv-actions">
          {people.length > 1 && <button type="button" className="icon-btn" title="رد على الجميع" aria-label="رد على الجميع" onClick={() => onReply({ kind: 'message', replyTo: last.id, subject: replySubject, to: people })}><ReplyAll size={18} /></button>}
          {me.role?.key !== 'employee' && <button type="button" className="icon-btn" title="رفع أو تحويل لشخص آخر" aria-label="رفع أو تحويل" onClick={() => onReply({ kind: 'message', forwardOf: last, subject: `رفع: ${last.subject}`, body: 'للاطلاع والإفادة.' })}><Forward size={18} /></button>}
          {isRecipient && <button type="button" className="icon-btn" title={data.archived ? 'إعادة إلى الوارد' : 'نقل إلى الأرشيف'} aria-label={data.archived ? 'إعادة إلى الوارد' : 'نقل إلى الأرشيف'} onClick={() => void toggleArchive()}>{data.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>}
        </div>
      </header>
      <div className="msg-thread">
        {data.thread.map((m) => <MessageCard key={m.id} m={m} mine={m.sender?.id === me.id} />)}
      </div>
      {target && (
        <form className="msg-reply" onSubmit={(e) => { e.preventDefault(); void sendReply() }}>
          <textarea className="input textarea" rows={2} value={reply} maxLength={channel === 'sms' ? 480 : 20000} placeholder={`اكتب رداً إلى ${target.name}…`} aria-label={`رد إلى ${target.name}`}
            onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendReply() } }} />
          <div className="msg-reply-bar">
            {data.sms_enabled && (
              <ChoiceField className="input select" aria-label="طريقة الإرسال" value={channel} onChange={(e) => setChannel(e.target.value as 'system' | 'sms')}>
                <option value="system">داخل النظام</option><option value="sms">رسالة قصيرة SMS</option>
              </ChoiceField>
            )}
            <Button type="submit" variant="primary" icon={<Send size={16} />} busy={sending} disabled={!reply.trim() || (channel === 'sms' && reply.length > 480)}>إرسال</Button>
          </div>
        </form>
      )}
    </div>
  )
}

function MessageCard({ m, mine }: { m: Full; mine: boolean }) {
  const toast = useToast()
  return (
    <article className="af-msg" data-mine={mine || undefined}>
      <header>
        <Avatar name={m.sender?.name ?? '؟'} size={36} />
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
      <p className="af-msg-body">{m.body}</p>
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
const LEAVE_STATUS: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' | 'danger' | 'neutral' }> = {
  pending: { label: 'بانتظار القرار', tone: 'warn' }, escalated: { label: 'عند الإدارة', tone: 'info' }, approved: { label: 'موافق عليه', tone: 'ok' },
  rejected: { label: 'مرفوض', tone: 'danger' }, cancelled: { label: 'ملغى', tone: 'neutral' },
}
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
    <div className="msg-conv">
      <header className="msg-conv-head">
        <button type="button" className="icon-btn msg-back" aria-label="رجوع إلى القائمة" onClick={back}><ArrowRight size={18} /></button>
        <div className="msg-conv-title"><h2>{LEAVE_KIND[leave.kind]}</h2><small>{mine ? 'طلبك' : leave.name}</small></div>
        <Pill tone={LEAVE_STATUS[leave.status]!.tone}>{LEAVE_STATUS[leave.status]!.label}</Pill>
      </header>
      <div className="leave-card">
        <div className="leave-who"><Avatar name={leave.name} size={52} /><span><b>{leave.name}</b><small>{LEAVE_KIND[leave.kind]}</small></span></div>
        <dl className="leave-facts">
          <div><dt>{leave.kind === 'permission' ? 'اليوم' : 'من'}</dt><dd>{day(leave.starts)}</dd></div>
          {leave.kind === 'permission'
            ? <div><dt>الساعات</dt><dd className="num">{leave.from_time?.slice(0, 5)} – {leave.to_time?.slice(0, 5)}</dd></div>
            : <div><dt>إلى</dt><dd>{day(leave.ends)}</dd></div>}
          {leave.kind !== 'permission' && <div><dt>أيام الدوام</dt><dd className="num">{leave.days}</dd></div>}
        </dl>
        <div className="leave-reason"><small>السبب</small><p>{leave.reason}</p></div>
        {review && (
          <div className="leave-actions">
            <Button variant="primary" icon={<Check size={18} />} busy={busy} onClick={() => void decide('approved')}>موافقة</Button>
            <Button icon={<X size={18} />} disabled={busy} onClick={() => void decide('rejected')}>رفض</Button>
            {hr && leave.status === 'pending' && <Button variant="ghost" icon={<Forward size={18} />} disabled={busy} onClick={() => void decide('escalated')}>إحالة إلى الإدارة</Button>}
          </div>
        )}
        {cancel && <div className="leave-actions"><Button variant="ghost" icon={<Undo2 size={18} />} disabled={busy} onClick={() => void decide('cancelled')}>إلغاء الطلب</Button></div>}
        {!review && !cancel && leave.status === 'pending' && !mine && <p className="muted">ينتظر قرار شؤون الموظفين.</p>}
      </div>
    </div>
  )
}

