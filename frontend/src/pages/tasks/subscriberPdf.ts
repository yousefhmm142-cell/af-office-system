import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

interface Cell {
  text: string
  x: number
  right: number
  y: number
  rtl: boolean
}

GlobalWorkerOptions.workerSrc = workerUrl

function mergeCells(line: Cell[]): Cell[] {
  const groups: Cell[][] = []
  for (const part of [...line].sort((a, b) => a.x - b.x)) {
    const group = groups.at(-1)
    if (group && part.x - group.at(-1)!.right <= 12) group.push(part)
    else groups.push([part])
  }
  return groups.map((group) => {
    const first = group[0]!
    const last = group.at(-1)!
    const rtl = group.filter((part) => part.rtl).length >= group.length / 2
    const parts = rtl ? [...group].reverse() : group
    const text = parts.map((part, index) => {
      const before = parts[index - 1]
      const space = before && (rtl ? before.x - part.right : part.x - before.right) > 2.2 ? ' ' : ''
      return space + part.text
    }).join('').normalize('NFKC')
    return { ...first, right: last.right, text, rtl }
  })
}

/** Reads a text-based subscriber table. A scan or an ambiguous layout needs an Excel source. */
export async function readPdfTable(file: File, isHeader: (cells: string[]) => boolean): Promise<string[][]> {
  const loading = getDocument({ data: await file.arrayBuffer(), enableXfa: false, useWasm: false })
  try {
    const pdf = await loading.promise
    if (pdf.numPages > 50) throw new Error('pdf_layout')
    const rows: string[][] = []
    let headers: Cell[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const cells = content.items.flatMap((item): Cell[] => {
        if (!('str' in item) || !item.str.trim()) return []
        const x = item.transform[4] as number
        return [{ text: item.str.trim(), x, right: x + item.width, y: item.transform[5] as number, rtl: item.dir === 'rtl' }]
      }).sort((a, b) => b.y - a.y)

      const lines: Cell[][] = []
      for (const cell of cells) {
        const line = lines.at(-1)
        if (line && Math.abs(line[0]!.y - cell.y) <= 3) line.push(cell)
        else lines.push([cell])
      }
      for (const line of lines) {
        const sorted = mergeCells(line)
        const labels = sorted.map((cell) => cell.text)
        if (isHeader(labels)) {
          headers = sorted
          if (!rows.length) rows.push(labels)
          else if (labels.length !== rows[0]!.length || labels.some((label, index) => label !== rows[0]![index])) throw new Error('pdf_layout')
          continue
        }
        if (!headers.length || sorted.length < 2) continue
        const values = headers.map(() => '')
        for (const cell of sorted) {
          const gap = (header: Cell) => Math.min(Math.abs(header.x - cell.x), Math.abs(header.right - cell.right))
          const column = headers.reduce((closest, header, index) => gap(header) < gap(headers[closest]!) ? index : closest, 0)
          if (values[column]) throw new Error('pdf_layout')
          values[column] = cell.text
        }
        rows.push(values)
      }
      page.cleanup()
    }
    if (rows.length < 2) throw new Error('pdf_layout')
    return rows
  } finally {
    await loading.destroy()
  }
}
