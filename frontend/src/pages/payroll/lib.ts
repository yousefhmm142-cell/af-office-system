export type BatchStatus = 'draft' | 'approved' | 'paid'
export interface Batch {
  id: number; title: string; month: string; percent: number; is_final: boolean; branch: { id: number; name: string } | null
  status: BatchStatus; total_net: number; employees_count: number; created_by: string | null; approved_by: string | null
  approved_at: string | null; paid_at: string | null; calculated_at: string | null; created_at: string | null
}
export interface Payment {
  national_id: string | null; phone: string | null; method: 'wallet' | 'bank' | null; provider: string | null
  account_number: string | null; holder_name: string | null; holder_national_id: string | null; holder_phone: string | null
}
export interface Item {
  id: number; user: { id: number; name: string } | null; salary_type: string; salary_amount: number
  base: number; overtime: number; bonuses: number; auto_deductions: number; manual_deductions: number; advance_deduction: number; net: number
  details: {
    present_days: number; absent_days: number; late_minutes: number; overtime_minutes: number; late_amount: number; absence_amount: number
    hourly: number; adjustments: Array<{ type: 'deduction' | 'bonus'; amount: number; reason: string }>; notes: string[]
  } | null
  payment: Payment | null
}
export interface Adjustment {
  id: number; user: { id: number; name: string } | null; type: 'deduction' | 'bonus'; month: string; amount: number; reason: string
  batch: { id: number; title: string; status: BatchStatus } | null; created_at: string
}
export interface Advance {
  id: number; user: { id: number; name: string } | null; amount: number; installment: number; start_month: string
  reason: string | null; paid: number; remaining: number; created_at: string
}
export type Mode = 'none' | 'wage' | 'fixed'
export interface Setting {
  id?: number; branch_id: number | null; effective_from: string | null
  late_mode: Mode; late_value: number; absence_mode: Mode; absence_value: number
  overtime_mode: Mode; overtime_value: number; overtime_cap_hours: number | null
}

export const STATUS: Record<BatchStatus, { label: string; tone: 'warn' | 'info' | 'ok' }> = {
  draft: { label: 'مسودة', tone: 'warn' },
  approved: { label: 'معتمدة', tone: 'info' },
  paid: { label: 'صُرفت', tone: 'ok' },
}

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 1350 → «1,350.00» */
export const fmt = (n: number) => money.format(Number(n) || 0)

export const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
export const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T12:00:00Z`))
