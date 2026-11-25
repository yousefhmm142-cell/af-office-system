import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { useConfirm } from '../../ui/Confirm'
import { Button } from '../../ui/primitives'
import { useToast } from '../../ui/Toast'
import { readSubscribersFile } from './subscribers'

export function SubscriberImport({ branchId, branchName }: { branchId: string; branchName?: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const directoryPath = `/tasks/subscribers?branch_id=${encodeURIComponent(branchId)}`

  async function importList(file: File) {
    setImporting(true)
    try {
      const list = await readSubscribersFile(file)
      if (!list.length) throw new Error('empty')
      const replace = await confirm({
        title: 'استيراد قائمة المشتركين؟',
        message: `سيستبدل الملف قائمة ${branchName ?? 'الفرع المحدد'} بـ ${list.length} مشتركًا.`,
        confirmLabel: 'استيراد القائمة',
      })
      if (!replace) return
      const result = await api<{ count: number }>(directoryPath, { method: 'PUT', body: { subscribers: list } })
      toast(`تم تحميل ${result.count} مشترك`)
    } catch (e) {
      const messages: Record<string, string> = {
        no_header: 'يلزم عمود «اسم المشترك» وعمود للجوال أو المنطقة أو الطبلون.',
        frameset: 'اختر ملف Excel أو ورقة الجدول من مجلد الملفات.',
        too_large: 'حجم الملف أكبر من 5 ميغابايت.',
        pdf_layout: 'يتطلب الاستيراد PDF نصيًا بجدول عناوين وأعمدة واضحة. استخدم Excel للملفات المصوّرة.',
        empty: 'لا توجد أسماء مشتركين في الملف.',
      }
      toast(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message
        : (e instanceof Error ? messages[e.message] : undefined) ?? 'تعذّرت قراءة الملف.', 'danger')
    } finally {
      setImporting(false)
      if (input.current) input.current.value = ''
    }
  }

  return <>
    <input ref={input} type="file" aria-label="ملف المشتركين" accept=".xlsx,.xltx,.xlsm,.csv,.htm,.html,.pdf" hidden
      onChange={(event) => { const file = event.target.files?.[0]; if (file) void importList(file) }} />
    <Button busy={importing} icon={<Upload size={18} />} onClick={() => input.current?.click()}>
      استيراد قائمة المشتركين
    </Button>
  </>
}
