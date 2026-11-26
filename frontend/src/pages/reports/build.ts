import { addDays, type ISODate } from '../../lib/dates'

// The weekly / monthly report: one plain structure (sections of rows) that the screen, the Excel file
// and the printout all show the same way. Only figures recorded in the system are summed; nothing is
// invented. Ported from the office's old system, adapted to the data the server sends.

export type Cell = string | number | null
export interface Section {
  key: string
  title: string
  note?: string
  columns: string[]
  rows: Cell[][]
  total?: Cell[]
}

interface FuelLine { fuelTypeId: number; receivedQty: number | null; consumption: number | null; closingBalance: number | null; shipmentNo: string; supplier?: string; unitPrice?: number | null }
interface GenLog { generatorId: number; didRun: boolean; runHours: number | null }
interface Maint { generatorId: number | null; types: string[]; oilNewLiters: number | null }
export interface Report { reportDate: ISODate; status: string; fuel: FuelLine[]; generators: GenLog[]; maintenance: Maint[] }
interface ZoneEntry { zoneId: number; supplied: boolean; supplyHours: number | null; runs: Array<{ start: string; end: string; loadUnit: 'A' | 'kW'; loads: Array<number | null> }>; bands?: Array<Array<number | null>> }
export interface Sheet { sheetDate: ISODate; status: string; zones: ZoneEntry[] }
export interface ReportTask { id: number; status: string; typeId: number; assignees: number[]; createdAt: string | null; completedAt: string | null }
export interface AttendanceRow { name: string; schedule: string | null; present: number; absent: number; leave: number; overtime: number; hours: number }
export interface ReportData {
  branch: { id: number; name: string }
  reports: Report[]
  sheets: Sheet[]
  tasks: ReportTask[]
  attendance: AttendanceRow[]
  technicians: Array<{ id: number; name: string; active: boolean }>
  generators: Array<{ id: number; name: string; brand: string; litersPerHour: number | null }>
  fuelTypes: Array<{ id: number; name: string }>
  zones: Array<{ id: number; name: string }>
  taskTypes: Array<{ id: number; name: string }>
}

const sum = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, x) => a + (x ?? 0), 0)
const r1 = (n: number) => Math.round(n * 10) / 10
const gazaDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(new Date(iso))

export function daysOf(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Diesel the generators should have used: hours × liters per hour. Null if no generator has a rate. */
function expected(r: Report, gens: Map<number, { litersPerHour: number | null }>): number | null {
  let total = 0
  let known = false
  for (const g of r.generators) {
    const rate = gens.get(g.generatorId)?.litersPerHour
    if (g.didRun && g.runHours && rate) { total += g.runHours * rate; known = true }
  }
  return known ? Math.round(total) : null
}

export function buildReport(d: ReportData, from: ISODate, to: ISODate): Section[] {
  const inRange = (x: ISODate) => x >= from && x <= to
  const reports = d.reports.filter((r) => inRange(r.reportDate))
  const sheets = d.sheets.filter((s) => inRange(s.sheetDate))
  const genMap = new Map(d.generators.map((g) => [g.id, g]))
  const sections: Section[] = []

  // ---------- Fuel, day by day ----------
  const fuels = d.fuelTypes.filter((f) => reports.some((r) => r.fuel.some((l) => l.fuelTypeId === f.id && (l.consumption !== null || l.receivedQty !== null))))
  const fuelRows = reports.map((r) => {
    const line = (id: number) => r.fuel.find((l) => l.fuelTypeId === id)
    return [
      r.reportDate,
      ...fuels.flatMap((f) => [line(f.id)?.receivedQty ?? null, line(f.id)?.consumption ?? null, line(f.id)?.closingBalance ?? null]),
      sum(r.fuel.map((l) => l.consumption)),
      expected(r, genMap),
    ] as Cell[]
  })
  sections.push({
    key: 'fuel',
    title: 'المحروقات',
    note: 'المتوقع = ساعات التشغيل × معدل لتر/ساعة لكل مولد.',
    columns: ['اليوم', ...fuels.flatMap((f) => [`${f.name}: وارد`, `${f.name}: استهلاك`, `${f.name}: متبقٍّ`]), 'مجموع الاستهلاك', 'الاستهلاك المتوقع'],
    rows: fuelRows,
    total: reports.length ? [
      'المجموع',
      ...fuels.flatMap((f) => [
        sum(reports.map((r) => r.fuel.find((l) => l.fuelTypeId === f.id)?.receivedQty)),
        sum(reports.map((r) => r.fuel.find((l) => l.fuelTypeId === f.id)?.consumption)),
        reports[reports.length - 1]!.fuel.find((l) => l.fuelTypeId === f.id)?.closingBalance ?? null,
      ]),
      sum(fuelRows.map((row) => row[row.length - 2] as number)),
      sum(fuelRows.map((row) => row[row.length - 1] as number | null)) || null,
    ] : undefined,
  })

  // ---------- Fuel received: every shipment, its number checked ----------
  sections.push(...shipmentSections(reports, d.fuelTypes, d.reports))

  // ---------- Generators ----------
  const genRows = d.generators
    .filter((g) => reports.some((r) => r.generators.some((l) => l.generatorId === g.id && l.didRun)))
    .map((g) => {
      const logs = reports.flatMap((r) => r.generators.filter((l) => l.generatorId === g.id && l.didRun))
      const hours = r1(sum(logs.map((l) => l.runHours)))
      const maint = reports.flatMap((r) => r.maintenance.filter((m) => m.generatorId === g.id))
      return [g.name, g.brand, logs.length, hours, g.litersPerHour ? Math.round(hours * g.litersPerHour) : null, maint.length,
        maint.filter((m) => m.types.includes('oil_change')).length, r1(sum(maint.map((m) => m.oilNewLiters)))] as Cell[]
    })
  sections.push({
    key: 'generators',
    title: 'المولدات',
    columns: ['المولد', 'الماركة', 'أيام التشغيل', 'ساعات التشغيل', 'الاستهلاك المتوقع', 'الصيانات', 'تغيير الزيت', 'زيت جديد (لتر)'],
    rows: genRows,
    total: genRows.length ? ['المجموع', '', null, r1(sum(genRows.map((x) => x[3] as number))), sum(genRows.map((x) => x[4] as number | null)) || null,
      sum(genRows.map((x) => x[5] as number)), sum(genRows.map((x) => x[6] as number)), r1(sum(genRows.map((x) => x[7] as number)))] : undefined,
  })

  // ---------- Distribution: zones ----------
  const zoneRows = d.zones
    .filter((z) => sheets.some((s) => s.zones.some((e) => e.zoneId === z.id)))
    .map((z) => {
      const entries = sheets.map((s) => s.zones.find((e) => e.zoneId === z.id)).filter((e): e is ZoneEntry => !!e)
      const supplied = entries.filter((e) => e.supplied)
      const runs = supplied.flatMap((e) => e.runs.filter((r) => r.start || r.end))
      const amps = supplied.flatMap((e) => {
        const band = (e.bands ?? []).flat().filter((v): v is number => v !== null)
        if (band.length) return (e.runs[0]?.loadUnit ?? 'A') === 'A' ? band : []
        return e.runs.filter((r) => r.loadUnit === 'A').flatMap((r) => r.loads).filter((v): v is number => v !== null)
      })
      const hours = r1(sum(supplied.map((e) => e.supplyHours)))
      return [z.name, supplied.length, entries.length - supplied.length, hours, supplied.length ? r1(hours / supplied.length) : null, runs.length,
        amps.length ? Math.round(sum(amps) / amps.length) : null] as Cell[]
    })
  sections.push({
    key: 'distribution',
    title: 'التوزيع والأحمال',
    note: 'متوسط الحمل من القراءات بالأمبير فقط.',
    columns: ['المنطقة', 'أيام التغذية', 'أيام دون تغذية', 'ساعات التغذية', 'متوسط الساعات في اليوم', 'التشغيلات', 'متوسط الحمل (A)'],
    rows: zoneRows,
    total: zoneRows.length ? ['المجموع', null, sum(zoneRows.map((x) => x[2] as number)), r1(sum(zoneRows.map((x) => x[3] as number))), null, sum(zoneRows.map((x) => x[5] as number)), null] : undefined,
  })

  // ---------- Tasks: technician × type ----------
  sections.push(taskMatrix(d.tasks.filter((t) => t.createdAt && inRange(gazaDate(t.createdAt))), d.technicians, d.taskTypes))

  // ---------- Attendance ----------
  sections.push({
    key: 'attendance',
    title: 'الحضور والانصراف',
    note: 'الإضافي بالدقائق. الأيام قبل اليوم فقط.',
    columns: ['الموظف', 'الدوام', 'أيام الحضور', 'الغياب', 'الإجازات', 'دقائق الإضافي', 'ساعات العمل'],
    rows: d.attendance.map((a) => [a.name, a.schedule, a.present, a.absent, a.leave, a.overtime, a.hours]),
    total: d.attendance.length ? ['المجموع', '', sum(d.attendance.map((a) => a.present)), sum(d.attendance.map((a) => a.absent)), sum(d.attendance.map((a) => a.leave)),
      sum(d.attendance.map((a) => a.overtime)), r1(sum(d.attendance.map((a) => a.hours)))] : undefined,
  })

  return sections
}

/** Number of tasks per technician and type, with totals. */
function taskMatrix(tasks: ReportTask[], techs: ReportData['technicians'], types: ReportData['taskTypes']): Section {
  const people = techs.filter((e) => e.active || tasks.some((t) => t.assignees.includes(e.id)))
  const used = types.filter((ty) => tasks.some((t) => t.typeId === ty.id))
  const count = (emp: number, type: number) => tasks.filter((t) => t.assignees.includes(emp) && t.typeId === type).length
  const rows = people.map((e) => [e.name, ...used.map((ty) => count(e.id, ty.id) || null), tasks.filter((t) => t.assignees.includes(e.id)).length] as Cell[])
  return {
    key: 'tasks',
    title: 'المهام: كل فني حسب نوع المهمة',
    columns: ['الفني', ...used.map((t) => t.name), 'المجموع'],
    rows,
    total: rows.length ? ['المجموع', ...used.map((ty) => people.reduce((n, e) => n + count(e.id, ty.id), 0)), people.reduce((n, e) => n + tasks.filter((t) => t.assignees.includes(e.id)).length, 0)] : undefined,
  }
}

/** Every fuel receipt of the period with its supplier and price, the shipment number checked; then per supplier. */
function shipmentSections(reports: Report[], fuelTypes: ReportData['fuelTypes'], allReports: Report[]): Section[] {
  const nameOf = (id: number) => fuelTypes.find((f) => f.id === id)?.name ?? '—'
  const norm = (n: string) => n.replace(/\s+/g, '').replace(/^0+/, '')
  const usedOn = new Map<string, Set<string>>()
  for (const r of allReports)
    for (const f of r.fuel) if ((f.receivedQty ?? 0) > 0 && f.shipmentNo?.trim()) {
      const k = norm(f.shipmentNo)
      usedOn.set(k, (usedOn.get(k) ?? new Set()).add(r.reportDate))
    }
  const receipts = reports.flatMap((r) => r.fuel.filter((f) => (f.receivedQty ?? 0) > 0).map((f) => ({ date: r.reportDate, f })))
  const rows = receipts.map(({ date, f }) => {
    const no = (f.shipmentNo ?? '').trim()
    const others = no ? [...(usedOn.get(norm(no)) ?? [])].filter((x) => x !== date) : []
    const check = !no ? 'دون رقم إرسالية' : others.length ? `الرقم مكرر (${others.sort().join('، ')})` : 'سليم'
    const price = f.unitPrice ?? null
    return [date, nameOf(f.fuelTypeId), f.receivedQty, no || null, f.supplier?.trim() || null, price, price !== null ? Math.round(price * (f.receivedQty ?? 0)) : null, check] as Cell[]
  })
  const problems = rows.filter((r) => r[7] !== 'سليم').length
  const out: Section[] = [{
    key: 'shipments',
    title: 'السولار الوارد: الشحنات',
    note: problems ? `${problems} تحتاج إلى مراجعة (رقم ناقص أو مكرر)` : rows.length ? 'كل أرقام الإرساليات سليمة' : undefined,
    columns: ['اليوم', 'الصنف', 'الكمية (لتر)', 'رقم الإرسالية', 'المورّد', 'سعر اللتر', 'التكلفة (شيكل)', 'فحص الرقم'],
    rows,
    total: rows.length ? ['المجموع', '', sum(rows.map((r) => r[2] as number)), null, null, null, sum(rows.map((r) => r[6] as number | null)) || null, ''] : undefined,
  }]
  const bySupplier = new Map<string, { n: number; qty: number; cost: number; priced: number }>()
  for (const { f } of receipts) {
    const k = f.supplier?.trim() || 'غير محدد'
    const x = bySupplier.get(k) ?? { n: 0, qty: 0, cost: 0, priced: 0 }
    x.n++
    x.qty += f.receivedQty ?? 0
    if (f.unitPrice != null) { x.cost += f.unitPrice * (f.receivedQty ?? 0); x.priced += f.receivedQty ?? 0 }
    bySupplier.set(k, x)
  }
  if (bySupplier.size > 1 || (bySupplier.size === 1 && !bySupplier.has('غير محدد')))
    out.push({
      key: 'suppliers',
      title: 'السولار الوارد: حسب المورّد',
      note: 'متوسط السعر من الشحنات التي كُتب سعرها فقط.',
      columns: ['المورّد', 'الشحنات', 'الكمية (لتر)', 'متوسط سعر اللتر', 'التكلفة (شيكل)'],
      rows: [...bySupplier].sort((x, y) => y[1].qty - x[1].qty).map(([k, x]) => [k, x.n, x.qty, x.priced ? Math.round((x.cost / x.priced) * 100) / 100 : null, x.priced ? Math.round(x.cost) : null]),
    })
  return out
}

// ---------- Trends and the period before ----------

export interface DayPoint { date: ISODate; value: number | null }

/** Day by day over the period: diesel used and tasks finished. Null = no report that day. */
export function dailySeries(d: ReportData, from: ISODate, to: ISODate, today: ISODate) {
  const days = daysOf(from, to)
  const use = new Map(d.reports.map((r) => [r.reportDate, sum(r.fuel.map((f) => f.consumption))]))
  const done = new Map<string, number>()
  for (const t of d.tasks) if (t.status === 'done' && t.completedAt) done.set(gazaDate(t.completedAt), (done.get(gazaDate(t.completedAt)) ?? 0) + 1)
  return {
    consumption: days.map((date) => ({ date, value: use.get(date) ?? null })),
    tasksDone: days.map((date) => ({ date, value: date > today ? null : done.get(date) ?? 0 })),
  }
}

/** The headline figures of one period, to set against the period before. */
export function periodMetrics(d: ReportData, from: ISODate, to: ISODate) {
  const reports = d.reports.filter((r) => r.reportDate >= from && r.reportDate <= to)
  const sheets = d.sheets.filter((s) => s.sheetDate >= from && s.sheetDate <= to)
  const inP = (iso: string | null) => !!iso && gazaDate(iso) >= from && gazaDate(iso) <= to
  const consumption = sum(reports.map((r) => sum(r.fuel.map((f) => f.consumption))))
  const runHours = r1(sum(reports.flatMap((r) => r.generators.filter((g) => g.didRun).map((g) => g.runHours))))
  return {
    reportDays: reports.length,
    consumption,
    perDay: reports.length ? Math.round(consumption / reports.length) : null,
    received: sum(reports.map((r) => sum(r.fuel.map((f) => f.receivedQty)))),
    runHours,
    litersPerHour: runHours ? r1(consumption / runHours) : null,
    supplyHours: r1(sum(sheets.flatMap((s) => s.zones.filter((z) => z.supplied).map((z) => z.supplyHours)))),
    tasksDone: d.tasks.filter((t) => t.status === 'done' && inP(t.completedAt)).length,
    tasksNew: d.tasks.filter((t) => inP(t.createdAt)).length,
  }
}

// The mark keeps the sign on the left in right-to-left text.
const pct = (now: number | null, before: number | null): Cell =>
  now === null || before === null || before === 0 ? null : `‎${now >= before ? '+' : '−'}${Math.abs(Math.round(((now - before) / before) * 100))}%`

/** This period against the one before, figure by figure. */
export function compareSection(now: ReturnType<typeof periodMetrics>, before: ReturnType<typeof periodMetrics>, labels: { now: string; before: string }): Section {
  const line = (name: string, k: keyof typeof now): Cell[] => [name, now[k], before[k], pct(now[k], before[k])]
  return {
    key: 'compare',
    title: 'مقارنة بالفترة التي قبلها',
    note: 'الفرق بالنسبة المئوية. الأيام التي ليس فيها تقرير لا تُحسب.',
    columns: ['البند', labels.now, labels.before, 'الفرق'],
    rows: [
      line('استهلاك السولار (لتر)', 'consumption'),
      line('متوسط الاستهلاك في اليوم (لتر)', 'perDay'),
      line('السولار الوارد (لتر)', 'received'),
      line('ساعات تشغيل المولدات', 'runHours'),
      line('لتر لكل ساعة تشغيل', 'litersPerHour'),
      line('ساعات تغذية المناطق', 'supplyHours'),
      line('مهام طُلبت', 'tasksNew'),
      line('مهام أُنجزت', 'tasksDone'),
      line('أيام فيها تقرير توليد', 'reportDays'),
    ],
  }
}
