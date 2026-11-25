import { api } from '../../api/client'

export interface Day {
  id: number; user_id: number; date: string; check_in: string | null; check_out: string | null
  worked_minutes: number; late_minutes: number; overtime_minutes: number; is_work_day: boolean
  recorded_offline: boolean; manually_edited: boolean; approval_status: 'pending' | 'approved'
  user?: { id: number; name: string }
}
export interface Totals { days: number; worked_minutes: number; late_minutes: number; overtime_minutes: number; late_days: number }
export interface PunchResult { ok: boolean; status: string; message: string; wait_until: string | null; day: Day | null }
export interface Mine {
  month: string; today: string; next: { status: string; message: string; wait_until: string | null }
  is_work_day?: boolean; today_day: Day | null; schedule: { name: string; start_time: string; end_time: string } | null; days: Day[]; totals: Totals
}
export interface BoardRow { user: { id: number; name: string; job_title: string | null }; state: State; schedule: string | null; schedule_name?: string | null; day: Day | null }
export type State = 'present' | 'late' | 'left' | 'absent' | 'not_yet' | 'off'
export interface Board {
  date: string; branch_id: number; rows: BoardRow[]; can_manage: boolean
  summary: { expected: number; present: number; late: number; absent: number; pending: number }
}
export interface Point {
  id: number; branch_id: number; name: string; code: string; is_active: boolean; network_required: boolean
  allowed_ips: string[]; has_location: boolean; radius_m: number
}

export const STATE: Record<State, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  present: { label: 'حاضر', tone: 'ok' },
  late: { label: 'متأخر', tone: 'warn' },
  left: { label: 'انصرف', tone: 'info' },
  absent: { label: 'غائب', tone: 'danger' },
  not_yet: { label: 'لم يحضر بعد', tone: 'neutral' },
  off: { label: 'عطلة', tone: 'neutral' },
}

/** 95 → «1:35» (hours:minutes). */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export const punch = (body: Record<string, unknown>) => api<PunchResult>('/attendance/punch', { method: 'POST', body })

/** The phone's position, if the person allows it (QR sheets that check the distance). */
export function position(): Promise<{ lat: number; lng: number; acc: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  })
}

export const monthName = (ym: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T12:00:00Z`))
export const dayName = (date: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
