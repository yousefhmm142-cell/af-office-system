import { Bell, History, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { NavItem } from './nav'

export function HeaderTools({items, unread, tasks}:{items:NavItem[];unread:number;tasks:number}) {
  const [open,setOpen]=useState<'search'|'alerts'|null>(null)
  const [query,setQuery]=useState('')
  const box=useRef<HTMLDivElement>(null)
  const {pathname,search}=useLocation()
  useEffect(()=>{setOpen(null);setQuery('')},[pathname,search])
  useEffect(()=>{
    if(!open)return
    const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(null)}
    document.addEventListener('pointerdown',outside)
    return ()=>document.removeEventListener('pointerdown',outside)
  },[open])
  const results=items.filter(i=>i.label.includes(query.trim()))
  return <div ref={box} className="header-tools" onKeyDown={e=>{if(e.key==='Escape'){box.current?.querySelector<HTMLButtonElement>('button[aria-expanded=true]')?.focus();setOpen(null)}}}>
    <button type="button" className="rbtn header-search" aria-expanded={open==='search'} aria-label="بحث في صفحات النظام" onClick={()=>setOpen(open==='search'?null:'search')}><Search size={18}/><span>بحث في الصفحات</span></button>
    {items.some(i=>i.to==='/audit') && <Link className="rbtn" to="/audit" title="آخر التحركات" aria-label="آخر التحركات"><History size={19}/></Link>}
    <button type="button" className="rbtn" aria-label="الإشعارات" aria-expanded={open==='alerts'} onClick={()=>setOpen(open==='alerts'?null:'alerts')}><Bell size={19}/>{unread+tasks>0 && <i className="alert-dot"/>}</button>
    {open && <div className="header-tool-panel">
      {open==='search' ? <><input className="input" type="search" autoFocus placeholder="اسم الصفحة…" aria-label="اسم الصفحة" value={query} onChange={e=>setQuery(e.target.value)}/>
      {results.map(({to,label,icon:Icon})=><Link key={to} to={to} onClick={()=>setOpen(null)}><Icon size={17}/>{label}</Link>)}{!results.length && <p>لم نعثر على صفحة بهذا الاسم.</p>}</> :
      <><b>الإشعارات</b>{unread>0 && <Link to="/messages">{unread} رسالة غير مقروءة</Link>}{tasks>0 && items.some(i=>i.to==='/my-tasks') && <Link to="/my-tasks">{tasks} مهام جديدة</Link>}{!unread && !(tasks && items.some(i=>i.to==='/my-tasks')) && <p>لا توجد إشعارات جديدة.</p>}</>}
    </div>}
  </div>
}
