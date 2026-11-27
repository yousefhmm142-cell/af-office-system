import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { api, ApiError } from '../api/client'
import type { User } from '../api/types'
import { can, useUser } from './auth'

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean }
const KEY = 'af-assistant'

const load = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Msg[] } catch { return [] } }
const keep = (m: Msg[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-30))) } catch { /* private mode */ } }

/** Questions to start with, matched to what this person can see. */
function suggestions(u: User): string[] {
  const out: string[] = []
  if (can(u, 'attendance.view')) out.push('من تأخر أو غاب اليوم؟')
  if (can(u, 'leaves.decide') || can(u, 'leaves.final')) out.push('ما طلبات الإجازة التي تنتظر القرار؟')
  if (can(u, 'payroll.view') || can(u, 'payroll.manage')) out.push('لخّص لي رواتب هذا الشهر')
  if (can(u, 'users.view')) out.push('كم موظفاً في كل فرع؟')
  if (can(u, 'tasks.view')) out.push('ما المهام المتأخرة الآن؟')
  if (u.branch) out.push('كم ساعة عملت هذا الشهر؟')
  out.push('كيف أقدّم طلب إجازة؟')
  if (can(u, 'users.manage')) out.push('كيف أضيف موظفاً جديداً؟')
  return out.slice(0, 5)
}

export function AssistantButton() {
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  // Other pages can open the assistant with a question already asked.
  useEffect(() => {
    const onAsk = (e: Event) => { setSeed((e as CustomEvent<string>).detail); setOpen(true) }
    window.addEventListener('af-ask', onAsk)
    return () => window.removeEventListener('af-ask', onAsk)
  }, [])
  useEffect(() => { api<{ enabled: boolean }>('/assistant').then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return <>
    <button type="button" className="ai-trigger" onClick={() => setOpen(true)} aria-label="المساعد الذكي (Ctrl+J)" title="المساعد الذكي (Ctrl+J)">
      <Sparkles size={18} aria-hidden="true" /><span>المساعد</span>
    </button>
    {open && createPortal(<AssistantPanel enabled={enabled} seed={seed} onSeeded={() => setSeed(null)} onClose={() => setOpen(false)} />, document.body)}
  </>
}

function AssistantPanel({ enabled, seed, onSeeded, onClose }: { enabled: boolean | null; seed: string | null; onSeeded(): void; onClose(): void }) {
  const me = useUser()
  const [messages, setMessages] = useState<Msg[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { keep(messages); end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { if (seed && enabled) { onSeeded(); void ask(seed) } }, [seed, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    const next: Msg[] = [...messages.filter((m) => !m.error), { role: 'user', content: question }]
    setMessages(next); setText(''); setBusy(true)
    try {
      const r = await api<{ answer: string }>('/assistant', { method: 'POST', body: { messages: next.slice(-12).map(({ role, content }) => ({ role, content })) } })
      setMessages([...next, { role: 'assistant', content: r.answer }])
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: e instanceof ApiError ? e.message : 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.', error: true }])
    } finally { setBusy(false); input.current?.focus() }
  }

  const first = me.name.split(' ')[0]
  return (
    <div className="ai-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="ai-panel" role="dialog" aria-modal="true" aria-label="المساعد الذكي">
        <header className="ai-head">
          <span className="ai-mark"><Sparkles size={18} /></span>
          <span className="ai-title"><b>المساعد الذكي</b><small>يجيب من بيانات النظام وبحسب صلاحياتك</small></span>
          {messages.length > 0 && <button type="button" className="ai-icon" onClick={() => setMessages([])} aria-label="محادثة جديدة" title="محادثة جديدة"><RotateCcw size={17} /></button>}
          <button type="button" className="ai-icon" onClick={onClose} aria-label="إغلاق"><X size={19} /></button>
        </header>

        <div className="ai-body">
          {messages.length === 0 ? (
            <div className="ai-hello">
              <span className="ai-orb"><Sparkles size={30} /></span>
              <h2>أهلاً {first}، كيف أساعدك؟</h2>
              <p>اسألني عن الموظفين، أو الحضور والغياب، أو الإجازات، أو الرواتب، أو المهام، أو كيف تعمل أي شيء في النظام.</p>
              {enabled === false ? <p className="ai-off">المساعد غير مفعّل بعد. يفعّله مدير النظام بإضافة مفتاح Anthropic إلى إعدادات الخادم.</p> : (
                <div className="ai-chips">{suggestions(me).map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}</div>
              )}
            </div>
          ) : (
            <div className="ai-thread">
              {messages.map((m, i) => (
                <div key={i} className="ai-msg" data-role={m.role} data-error={m.error || undefined}>
                  {m.role === 'assistant' && <span className="ai-mark sm"><Sparkles size={14} /></span>}
                  <div className="ai-bubble">{m.role === 'assistant' ? <Markdown text={m.content} onNavigate={onClose} /> : m.content}</div>
                </div>
              ))}
              {busy && <div className="ai-msg" data-role="assistant"><span className="ai-mark sm"><Sparkles size={14} /></span><div className="ai-bubble ai-typing"><i /><i /><i /><span>يبحث في بيانات النظام…</span></div></div>}
              <div ref={end} />
            </div>
          )}
        </div>

        <form className="ai-input" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
          <textarea ref={input} rows={1} value={text} maxLength={2000} placeholder="اكتب سؤالك…" aria-label="سؤالك" disabled={enabled === false}
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px` }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }} />
          <button type="submit" className="ai-send" disabled={!text.trim() || busy || enabled === false} aria-label="إرسال"><ArrowUp size={19} /></button>
        </form>
        <p className="ai-foot">قد يخطئ المساعد أحياناً؛ تحقق من الأرقام المهمة في صفحاتها.</p>
      </aside>
    </div>
  )
}

/* ---------- a small Markdown reader: paragraphs, lists, tables, bold, links ---------- */

function inline(s: string, onNavigate: () => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1]) out.push(<b key={k++}>{m[1]}</b>)
    else if (m[2] && m[3]) out.push(m[3].startsWith('/') ? <Link key={k++} to={m[3]} onClick={onNavigate}>{m[2]}</Link> : <a key={k++} href={m[3]} target="_blank" rel="noreferrer">{m[2]}</a>)
    else if (m[4]) out.push(<code key={k++}>{m[4]}</code>)
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0, k = 0
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  while (i < lines.length) {
    const l = lines[i]!
    if (!l.trim()) { i++; continue }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const head = cells(l); i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!))
      blocks.push(<div key={k++} className="ai-table"><table><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, onNavigate)}</th>)}</tr></thead>
        <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}>{inline(c, onNavigate)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    if (/^#{1,4}\s/.test(l)) { blocks.push(<h4 key={k++}>{inline(l.replace(/^#+\s/, ''), onNavigate)}</h4>); i++; continue }
    if (/^\s*([-*•]|\d+[.)])\s/.test(l)) {
      const ordered = /^\s*\d/.test(l)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*•]|\d+[.)])\s/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={k++}>{items.map((it, j) => <li key={j}>{inline(it, onNavigate)}</li>)}</List>)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#)/.test(lines[i]!)) para.push(lines[i++]!)
    if (!para.length) { para.push(lines[i++]!) }
    blocks.push(<p key={k++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, onNavigate)}</Fragment>)}</p>)
  }
  return <>{blocks}</>
}

/** Opens the assistant and asks it this question. */
export const askAssistant = (q: string) => window.dispatchEvent(new CustomEvent('af-ask', { detail: q }))
