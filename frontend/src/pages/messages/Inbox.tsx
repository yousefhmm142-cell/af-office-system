import { Archive, ArchiveRestore, ArrowRight, CalendarDays, Clock, Forward, Inbox as InboxIcon, Mail, MailOpen, Paperclip, PenLine, Reply, ReplyAll, Search, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, ApiError, openFile } from '../../api/client'
import { useUser } from '../../app/auth'
import { useLoad } from '../../lib/useLoad'
import { ErrorBanner } from '../../ui/Field'
import { Loading, PageHead } from '../../ui/PageHead'
import { Avatar, Button, Pill } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { Compose, KindIcon, type Draft } from './Compose'
import { fullWhen, KIND, setUnread, when, type Full, type Summary } from './lib'

type Folder = 'inbox' | 'sent' | 'archive'
const FOLDERS: Array<[Folder, string, typeof InboxIcon]> = [['inbox', 'الوارد', InboxIcon], ['sent', 'المرسل', Send], ['archive', 'الأرشيف', Archive]]

/** Internal mail: the list on one side, the conversation on the other (one at a time on a phone). */
export function Inbox() {
  const { id } = useParams()
  const navigate = useNavigate()
  const me = useUser()
  const [folder, setFolder] = useState<Folder>('inbox')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useLoad<{ messages: Summary[]; unread: number }>(`/messages?folder=${folder}${q ? `&search=${encodeURIComponent(q)}` : ''}`)
  const [draft, setDraft] = useState<Draft | null>(null)
  const employee = me.role?.key === 'employee'

  useEffect(() => { if (data) setUnread(data.unread) }, [data])
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  return (
    <div className={`af-mail${id ? ' reading' : ''}`}>
      <div className="af-mail-head">
        <PageHead title="المراسلات" eyebrow={employee ? 'راسل مدير فرعك أو شؤون الموظفين' : 'الرسائل والطلبات'} />
        <div className="af-compose-btns">
          <Button variant="primary" size="lg" icon={<PenLine size={18} />} onClick={() => setDraft({ kind: 'message' })}>رسالة جديدة</Button>
          <Button icon={<CalendarDays size={18} />} onClick={() => setDraft({ kind: 'leave_request' })}>طلب إجازة</Button>
          <Button icon={<Clock size={18} />} onClick={() => setDraft({ kind: 'permission_request' })}>طلب إذن</Button>
        </div>
      </div>

      <div className="af-mail-body">
        <aside className="card glass af-mail-list">
          <div className="segmented af-folders" role="radiogroup" aria-label="المجلد">
            {FOLDERS.map(([f, label, Icon]) => (
              <button key={f} type="button" role="radio" aria-checked={folder === f} onClick={() => { setFolder(f); navigate('/messages') }}>
                <Icon size={15} /> {label}{f === 'inbox' && (data?.unread ?? 0) > 0 && <span className="af-count num">{data?.unread}</span>}
              </button>
            ))}
          </div>
          <div className="af-search"><Search size={17} aria-hidden="true" /><input className="input" placeholder="ابحث في الرسائل" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث" /></div>
          <ErrorBanner text={error} />
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
        </aside>

        <section className="card glass af-mail-read">
          {id ? <Conversation id={id} onReply={setDraft} onChanged={() => void reload()} /> : (
            <div className="af-mail-empty big"><MailOpen size={44} /><p>اختر رسالة لقراءتها</p></div>
          )}
        </section>
      </div>

      {draft && <Compose draft={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); setFolder('sent'); void reload() }} />}
    </div>
  )
}

function Conversation({ id, onReply, onChanged }: { id: string; onReply(d: Draft): void; onChanged(): void }) {
  const me = useUser()
  const toast = useToast()
  const navigate = useNavigate()
  const { data, error, loading, setData } = useLoad<{ thread: Full[]; current_id: number; archived: boolean; unread: number }>(`/messages/${id}`)
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
        <Button variant="primary" icon={<Reply size={18} />} onClick={() => onReply({ kind: 'message', replyTo: last.id, subject: replySubject, to: last.sender && last.sender.id !== me.id ? [last.sender] : others(last).slice(0, 1) })}>رد</Button>
        {uniq(data.thread.flatMap(others)).length > 1 && (
          <Button icon={<ReplyAll size={18} />} onClick={() => onReply({ kind: 'message', replyTo: last.id, subject: replySubject, to: uniq(data.thread.flatMap(others)) })}>رد على الجميع</Button>
        )}
        {me.role?.key !== 'employee' && (
          <Button icon={<Forward size={18} />} onClick={() => onReply({ kind: 'message', forwardOf: last, subject: `رفع: ${last.subject}`, body: 'للاطلاع والإفادة.' })}>رفع / تحويل</Button>
        )}
      </footer>
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
      {m.kind !== 'message' && !mine && <Pill tone={KIND[m.kind].tone}>يمكنك الرد بالموافقة أو الرفض، أو رفعه للإدارة</Pill>}
    </article>
  )
}
