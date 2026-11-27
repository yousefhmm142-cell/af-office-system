import { Copy, FileText, MessageCircle, Printer } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'

/** Today's report as plain text: copy it, send it on WhatsApp, or print it. */
export function ReportDialog({ lines, onClose }: { lines: string[]; onClose(): void }) {
  const toast = useToast()
  const text = lines.join('\n')
  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) return
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${lines[0]}</title><style>body{font-family:Almarai,Tahoma,sans-serif;padding:32px;line-height:2;color:#1b1517}h1{font-size:20px;margin:0 0 12px;color:#8E1B2B}p{margin:0}</style></head><body><h1>${lines[0]}</h1>${lines.slice(1).map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '&nbsp;'}</p>`).join('')}</body></html>`)
    w.document.close(); w.focus(); w.print()
  }
  return (
    <Dialog open onClose={onClose} title="تقرير اليوم" subtitle="ملخص جاهز للإرسال أو الطباعة" icon={<FileText size={20} />}
      footer={<>
        <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        <Button icon={<Printer size={16} />} onClick={print}>طباعة</Button>
        <Button icon={<Copy size={16} />} onClick={() => void navigator.clipboard?.writeText(text).then(() => toast('نُسخ التقرير'))}>نسخ</Button>
        <a className="btn primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> واتساب</a>
      </>}>
      <pre className="cc-report">{text}</pre>
    </Dialog>
  )
}
