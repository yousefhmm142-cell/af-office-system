import { Check, ChevronDown, Search } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import './choice-field.css'

type Props = SelectHTMLAttributes<HTMLSelectElement>
type Choice = { text: string; value: string; disabled: boolean }

export function ChoiceField({ id, className = '', style, disabled, children, ...props }: Props) {
  const element = useRef<HTMLSelectElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const generated = useId()
  const [open,setOpen] = useState(false)
  const [selectedText,setSelectedText] = useState('')
  useLayoutEffect(()=>{
    setSelectedText(element.current?.selectedOptions[0]?.text ?? '')
  },[props.value,children])
  const [query,setQuery] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{
    if (!open || !trigger.current || !panel.current) return
    const anchor = trigger.current
    const menu = panel.current
    function position() {
      const r = anchor.getBoundingClientRect()
      const width = Math.min(innerWidth-16, Math.max(r.width, 220))
      const below = innerHeight-r.bottom-10
      const above = r.top-10
      const up = below < 230 && above > below
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1
      const px = (value:number) => value/scale+'px'
      Object.assign(menu.style, {width: px(width), maxHeight: px(Math.max(70,up ? above : below)),
        left: px(Math.max(8, Math.min(innerWidth-width-8,r.right-width))),
        top: up ? 'auto' : px(r.bottom+4), bottom: up ? px(innerHeight-r.top+4) : 'auto'})
    }
    position()
    const target = menu.querySelector<HTMLElement>('input, button[aria-pressed="true"]:not(:disabled)') ?? menu.querySelector<HTMLElement>('button:not(:disabled)')
    target?.focus({preventScroll:true})
    const outside = (e:Event) => { if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown',outside,true)
    document.addEventListener('focusin',outside,true)
    window.addEventListener('scroll',position,true)
    window.addEventListener('resize',position)
    return ()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside,true);window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position)}
  },[open])
  const options: Choice[] = Array.from(element.current?.options ?? [], option => ({
    text: option.text, value: option.value, disabled: option.disabled,
  }))
  const visible = options.filter(option => option.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  function choose(value: string) {
    const select = element.current
    if (!select || select.matches(':disabled')) return
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    setOpen(false)
    trigger.current?.focus()
  }
  return <span className={'af-choice '+className} style={style}>
    <button type="button" ref={trigger} id={id} className="af-choice-trigger" disabled={disabled}
      aria-label={props['aria-label']} aria-expanded={open} aria-controls={open ? generated : undefined}
      onClick={()=>{
        setQuery('');setOpen(!open)
      }}><span className="sr-only">{selectedText || 'اختيار'}</span></button>
    <select {...props} ref={element} inert disabled={disabled} tabIndex={-1} aria-hidden="true" className="af-choice-display">{children}</select>
    <ChevronDown size={16} aria-hidden="true" />
    {open && createPortal(<div ref={panel} role="group" aria-label={props['aria-label'] || 'الخيارات'} id={generated} className="af-choice-panel af-anchored-options" onClick={e=>e.stopPropagation()}
        onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus()}}}>
        {options.length>6 && <label className="af-choice-search"><Search size={17}/><input className="input" placeholder="ابحث في الخيارات" aria-label="ابحث في الخيارات" value={query} onChange={e=>setQuery(e.target.value)} /></label>}
        <div className="af-choice-options" onKeyDown={event=>{
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (!buttons.length || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
          buttons[next]?.focus()
        }}>
          {visible.map(option=><button key={option.value} className="af-choice-option" type="button" disabled={option.disabled}
            aria-pressed={option.value===element.current?.value} onClick={()=>choose(option.value)}>
            {option.text}{option.value===element.current?.value && <Check size={17}/>}
          </button>)}
          {!visible.length && <p>لا توجد خيارات مطابقة.</p>}
        </div>
      </div>, trigger.current?.closest('dialog') ?? document.body)}
  </span>
}
