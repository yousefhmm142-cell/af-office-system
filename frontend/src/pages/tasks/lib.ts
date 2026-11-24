import { useEffect, useState } from 'react'

export type Status = 'new' | 'sent' | 'seen' | 'in_progress' | 'done' | 'cancelled'
export type Priority = 'normal' | 'urgent' | 'emergency'
export interface Assignee { id: number; name: string; phone?: string | null; wa_code?: number }
export interface Task {
  id: number; number: number; branch_id: number; type: { id: number; name: string } | null; details: string | null
  subscriber_name: string | null; subscriber_phone: string | null; zone: { id: number; name: string } | null; location_text: string | null
  priority: Priority; expected_minutes: number; status: Status; late: boolean; assignees: Assignee[]
  created_at: string; sent_at: string | null; seen_at: string | null; started_at: string | null; completed_at: string | null; cancelled_at: string | null
  actual_minutes: number | null; completion_notes: string | null; cancel_reason: string | null; has_photo: boolean; recorded_offline: boolean
  link_token?: string; created_by?: string | null
  events?: Array<{ event: string; actor: string | null; at: string; offline: boolean; meta: Record<string, unknown> | null }>
}
export interface TaskType { id: number; branch_id: number | null; name: string; default_minutes: number; is_active: boolean }
export interface Zone { id: number; branch_id: number; name: string; is_active: boolean }
export interface Technician { id: number; name: string; job_title: string | null; department: string | null; phone: string | null; wa_code: number; open: number }
export interface Options { types: TaskType[]; zones: Zone[]; technicians: Technician[]; branch_id: number }

export const STATUS: Record<Status, { label: string; tone: 'neutral' | 'info' | 'brand' | 'ok' | 'warn' | 'danger' }> = {
  new: { label: 'لم تُرسل', tone: 'neutral' },
  sent: { label: 'أُرسلت', tone: 'info' },
  seen: { label: 'فتحها الفني', tone: 'info' },
  in_progress: { label: 'قيد التنفيذ', tone: 'brand' },
  done: { label: 'أُنجزت', tone: 'ok' },
  cancelled: { label: 'أُلغيت', tone: 'neutral' },
}
export const PRIORITY: Record<Priority, { label: string; tone: 'neutral' | 'warn' | 'danger' }> = {
  normal: { label: 'عادية', tone: 'neutral' },
  urgent: { label: 'مستعجلة', tone: 'warn' },
  emergency: { label: 'طارئة', tone: 'danger' },
}
export const MINUTES = [15, 30, 45, 60, 90, 120, 180, 240]
export const EVENT: Record<string, string> = {
  created: 'أُنشئت', sent_whatsapp: 'أُرسلت عبر واتساب', sent_app: 'أُرسلت داخل النظام', seen: 'فتحها الفني', started: 'بدأ العمل',
  completed: 'أُنجزت', cancelled: 'أُلغيت', reassigned: 'تغيّر الفني', edited: 'عُدّلت',
}

export const durationText = (m: number) => (m < 60 ? `${m} دقيقة` : m % 60 === 0 ? (m === 60 ? 'ساعة' : m === 120 ? 'ساعتان' : `${m / 60} ساعات`) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ساعة`)
export const linkFor = (token: string) => `${window.location.origin}/t/${token}`

/** The order as the technician reads it in WhatsApp. */
export function whatsappText(t: Task): string {
  const flag = t.priority === 'emergency' ? 'طارئ: ' : t.priority === 'urgent' ? 'مستعجل: ' : ''
  const lines = [`${flag}مهمة${t.assignees.length > 1 ? ' مشتركة' : ''} رقم ${t.number} · ${t.type?.name ?? ''}`]
  if (t.details?.trim()) lines.push(t.details.trim())
  const who = [t.subscriber_name, t.subscriber_phone].filter(Boolean).join(' · ')
  if (who) lines.push(`المشترك: ${who}`)
  const where = [t.zone?.name, t.location_text].filter(Boolean).join(' · ')
  if (where) lines.push(`المكان: ${where}`)
  lines.push(`المدة المتوقعة: ${durationText(t.expected_minutes)}`)
  if (t.link_token) lines.push('', 'افتح المهمة واضغط «بدأت» ثم «أنجزت»:', linkFor(t.link_token))
  return lines.join('\n')
}
export const whatsappUrl = (phone: string, text: string, code = 970) => `https://wa.me/${code}${phone.replace(/^0/, '')}?text=${encodeURIComponent(text)}`

/** Minutes since a moment, refreshed every 30 seconds. */
export function useMinutesSince(iso: string | null): number | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)) : null
}

const fmtTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Gaza' })
export const timeOf = (iso: string | null) => (iso ? fmtTime.format(new Date(iso)) : '—')
