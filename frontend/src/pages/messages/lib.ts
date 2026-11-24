import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../../api/client'

export type Kind = 'message' | 'leave_request' | 'permission_request'
export interface Summary {
  id: number; subject: string; kind: Kind; preview: string; sender: { id: number; name: string } | null
  to: string; recipients_count: number; has_attachments: boolean; read: boolean; created_at: string
}
export interface Full {
  id: number; thread_id: number; kind: Kind; subject: string; body: string
  meta: { from?: string; to?: string; date?: string; from_time?: string; to_time?: string } | null
  sender: { id: number; name: string } | null; groups_label: string | null
  recipients: Array<{ id: number; name: string; read: boolean }>; recipients_count: number
  attachments: Array<{ id: number; name: string; mime: string; size: number }>
  forwarded: Full | null; created_at: string
}
export interface Recipient { id: number; name: string; role: string | null; role_key: string | null; branch: string | null; job_title: string | null }
export interface Group { type: 'all' | 'branch' | 'department'; id: number | null; name: string }

export const KIND: Record<Kind, { label: string; tone: 'info' | 'warn' | 'neutral' }> = {
  message: { label: 'رسالة', tone: 'neutral' },
  leave_request: { label: 'طلب إجازة', tone: 'info' },
  permission_request: { label: 'طلب إذن', tone: 'warn' },
}

const fmtDay = new Intl.DateTimeFormat('ar-EG-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'Asia/Gaza' })
const fmtTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Gaza' })
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' })
/** Today → «3:15 م», otherwise «24 نوفمبر». */
export function when(iso: string): string {
  const d = new Date(iso)
  return dayKey.format(d) === dayKey.format(new Date()) ? fmtTime.format(d) : fmtDay.format(d)
}
export const fullWhen = (iso: string) => `${fmtDay.format(new Date(iso))} · ${fmtTime.format(new Date(iso))}`

// ---- The unread count, shared by the menu badge and the inbox ----
let unread = 0
const listeners = new Set<() => void>()
export function setUnread(n: number) {
  if (n === unread) return
  unread = n
  listeners.forEach((l) => l())
}
export function useUnread(): number {
  const n = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => unread)
  useEffect(() => {
    const tick = () => { if (navigator.onLine && document.visibilityState === 'visible') void api<{ unread: number }>('/messages/unread').then((r) => setUnread(r.unread)).catch(() => undefined) }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])
  return n
}
