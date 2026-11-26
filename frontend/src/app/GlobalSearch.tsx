import { CornerDownLeft, FileText, Hash, Search, Stamp, UserRound, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { fold } from '../pages/tasks/subscribers'
import { can, useUser } from './auth'
import { navFor } from './nav'

interface Hit { key: string; group: 'pages' | 'tasks' | 'subscribers' | 'seals' | 'people'; title: string; hint?: string; to: string }
interface Remote {
  tasks: Array<{ id: number; number: number; type: string | null; branch: string | null; hint: string }>
  subscribers: Array<{ n: string; a: string | null; b: string | null; p: string | null }>
  people: Array<{ id: number; name: string; title: string | null }>
}

const GROUPS: Array<{ key: Hit['group']; label: string }> = [
  { key: 'pages', label: 'صفحات' },
  { key: 'tasks', label: 'مهام' },
  { key: 'subscribers', label: 'مشتركون' },
  { key: 'seals', label: 'أختام' },
  { key: 'people', label: 'موظفون' },
]
const ICON = { pages: FileText, tasks: Hash, subscribers: UserRound, seals: Stamp, people: Users } as const
const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/** Opens the search window from anywhere (a button, the «المزيد» page). */
export const openSearch = () => window.dispatchEvent(new Event('af:search'))

export function SearchButton({ className }: { className?: string }) {
  return (
    <button type="button" className={`search-btn${className ? ` ${className}` : ''}`} onClick={openSearch} aria-label="بحث (Ctrl+K)" title="بحث (Ctrl+K)">
      <Search size={20} aria-hidden="true" />
    </button>
  )
}

/** The search window, mounted once in the shell: Ctrl+K, «/» outside a text box, or openSearch(). */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); setOpen(true) }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen(true) }
    }
    const onOpen = () => setOpen(true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('af:search', onOpen)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('af:search', onOpen) }
  }, [])
  return open ? <SearchWindow onClose={() => setOpen(false)} /> : null
}

function SearchWindow({ onClose }: { onClose(): void }) {
  const me = useUser()
  const navigate = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<{ q: string; data: Remote } | null>(null)
  const tasks = can(me, 'tasks.view') || can(me, 'tasks.manage')
  const seals = can(me, 'seals.manage') && !!me.modules?.includes('seals')
  const term = latin(query).trim()

  useEffect(() => {
    if (!term) return
    let alive = true
    const t = window.setTimeout(() => {
      api<Remote>(`/shell/search?q=${encodeURIComponent(term)}`).then((data) => { if (alive) setRemote({ q: term, data }) }).catch(() => {})
    }, 250)
    return () => { alive = false; window.clearTimeout(t) }
  }, [term])

  const hits = useMemo(() => {
    const q = fold(term)
    if (!q) return []
    const words = q.split(' ')
    const has = (text: string) => { const t = fold(text); return words.every((w) => t.includes(w)) }
    const out: Hit[] = []
    const pages = [...navFor(me), { to: '/guide', label: 'دليل الاستخدام' }]
    for (const p of pages.filter((p) => has(p.label)).slice(0, 5)) out.push({ key: `p:${p.to}`, group: 'pages', title: p.label, to: p.to })
    const r = remote?.q === term ? remote.data : null
    for (const t of r?.tasks ?? []) out.push({ key: `t:${t.id}`, group: 'tasks', title: `#${t.number} · ${t.type ?? 'مهمة'}`, hint: [t.branch, t.hint].filter(Boolean).join(' · '), to: `/tasks?open=${t.id}` })
    for (const s of r?.subscribers ?? []) out.push({ key: `s:${s.n}:${s.b}`, group: 'subscribers', title: s.n, hint: [s.a, s.b && `طبلون ${s.b}`].filter(Boolean).join(' · '), to: `/subscriber?${new URLSearchParams({ name: s.n, ...(s.b ? { board: s.b } : {}), ...(s.p ? { phone: s.p } : {}) })}` })
    const num = /^#?\s*(\d+)$/.exec(term)?.[1]
    if (seals && num && num.length >= 5) out.push({ key: `seal:${num}`, group: 'seals', title: `الختم ${num}`, hint: 'ابحث عنه في سجل الأختام', to: `/seals/log?q=${num}` })
    for (const p of r?.people ?? []) out.push({ key: `e:${p.id}`, group: 'people', title: p.name, hint: p.title ?? undefined, to: p.id === me.id ? '/me' : `/employees/${p.id}` })
    return out
  }, [term, remote, me, seals])

  useEffect(() => { ref.current?.showModal(); input.current?.focus() }, [])
  useEffect(() => setActive(0), [query])
  useEffect(() => { document.getElementById(`gs-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  function go(h: Hit | undefined) {
    if (!h) return
    onClose()
    navigate(h.to)
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.max(0, Math.min(hits.length - 1, i + 1))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active] ?? hits[0]) }
  }

  const waiting = !!term && remote?.q !== term
  let n = -1
  return (
    <dialog ref={ref} className="gsearch" aria-label="بحث شامل" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="gs-panel">
        <div className="gs-field">
          <Search size={22} aria-hidden="true" />
          <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder={tasks ? 'صفحة، رقم مهمة، اسم مشترك، رقم ختم…' : 'اسم الصفحة أو اسم موظف…'} aria-label="بحث"
            role="combobox" aria-expanded={hits.length > 0} aria-controls="gs-results" aria-activedescendant={hits.length ? `gs-${active}` : undefined} autoComplete="off" />
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="gs-results" id="gs-results" role="listbox">
          {GROUPS.map((g) => {
            const list = hits.filter((h) => h.group === g.key)
            if (!list.length) return null
            return (
              <div key={g.key} role="group" aria-label={g.label}>
                <p className="gs-group">{g.label}</p>
                {list.map((h) => {
                  n++
                  const i = n
                  const Icon = ICON[h.group]
                  return (
                    <button key={h.key} id={`gs-${i}`} type="button" role="option" aria-selected={i === active} className="gs-hit" onMouseMove={() => setActive(i)} onClick={() => go(h)}>
                      <Icon size={17} aria-hidden="true" />
                      <span className="gs-text"><b>{h.title}</b>{h.hint && <small>{h.hint}</small>}</span>
                      {i === active && <CornerDownLeft size={15} aria-hidden="true" className="gs-enter" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {term && !hits.length && !waiting && <p className="gs-empty">لا توجد نتائج لـ«{term}».</p>}
          {term && !hits.length && waiting && <p className="gs-empty">جارٍ البحث…</p>}
          {!term && <p className="gs-empty">{tasks ? 'اكتب اسم صفحة، أو رقم مهمة (35)، أو اسم مشترك، أو رقم ختم.' : 'اكتب اسم الصفحة التي تريدها.'}</p>}
        </div>
        <p className="gs-foot"><kbd>↑</kbd><kbd>↓</kbd> للتنقل · <kbd>Enter</kbd> للفتح · <kbd>Esc</kbd> للإغلاق</p>
      </div>
    </dialog>
  )
}
