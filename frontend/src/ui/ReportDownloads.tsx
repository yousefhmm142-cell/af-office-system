import { FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { useState, type RefObject } from 'react'
import { saveFile } from '../lib/saveFile'
import { Button } from './primitives'
import { useToast } from './Toast'

const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function ReportDownloads({ sheet, name, headers, rows }: {
  sheet: RefObject<HTMLElement | null>
  name: string
  headers: string[]
  rows: (string | number)[][]
}) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const toast = useToast()

  async function download(format: 'pdf' | 'xlsx') {
    setBusy(format)
    try {
      if (format === 'pdf' && sheet.current) {
        const { sheetToPdf } = await import('../lib/sheetPdf')
        await saveFile(await sheetToPdf(sheet.current), `${name}.pdf`, 'application/pdf')
      } else if (format === 'xlsx') {
        const { Workbook } = await import('exceljs')
        const workbook = new Workbook()
        const report = workbook.addWorksheet('الكشف', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
        headers.forEach((label, index) => {
          report.getColumn(index + 1).width = index === 0 ? 30 : Math.max(16, label.length + 5)
        })
        report.addRow(headers).font = { bold: true }
        report.addRows(rows)
        await saveFile(await workbook.xlsx.writeBuffer(), `${name}.xlsx`, excelMime)
      }
    } catch {
      toast('تعذّر تجهيز الملف.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  return <div className="af-report-downloads no-print">
    <Button icon={<Printer size={17} />} disabled={!rows.length || !!busy} onClick={() => window.print()}>طباعة الكشف</Button>
    <Button icon={<FileSpreadsheet size={17} />} busy={busy === 'xlsx'} disabled={!rows.length || !!busy} onClick={() => void download('xlsx')}>Excel</Button>
    <Button icon={<FileText size={17} />} busy={busy === 'pdf'} disabled={!rows.length || !!busy} onClick={() => void download('pdf')}>PDF</Button>
  </div>
}
