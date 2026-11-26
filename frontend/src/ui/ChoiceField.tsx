import { Check, ChevronDown, Search } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from './Dialog'
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
  const [title,setTitle] = useState('')
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
  }
  return <span className={'af-choice '+className} style={style}>
    <button type="button" ref={trigger} id={id} className="af-choice-trigger" disabled={disabled}
      aria-label={props['aria-label']} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? generated : undefined}
      onClick={()=>{
        setTitle(props['aria-label'] || Array.from(trigger.current?.labels?.[0]?.childNodes ?? []).filter(node=>node.nodeType===Node.TEXT_NODE || (node instanceof Element && !node.contains(trigger.current))).map(node=>node.textContent).join(' ').trim() || 'اختر من القائمة')
        setQuery('');setOpen(true)
      }}><span className="sr-only">{selectedText || 'اختيار'}</span></button>
    <select {...props} ref={element} inert disabled={disabled} tabIndex={-1} aria-hidden="true" className="af-choice-display">{children}</select>
    <ChevronDown size={16} aria-hidden="true" />
    {open && createPortal(<Dialog open title={title} className="af-choice-dialog" onClose={()=>setOpen(false)}>
      <div id={generated} className="af-choice-panel" onClick={event=>event.stopPropagation()}>
        {options.length>6 && <label className="af-choice-search"><Search size={17}/><input autoFocus className="input" placeholder="ابحث في الخيارات" aria-label="ابحث في الخيارات" value={query} onChange={e=>setQuery(e.target.value)} /></label>}
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
      </div>
    </Dialog>,document.body)}
  </span>
}
