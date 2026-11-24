import { ApiError } from '../api/client'
import { punch, type PunchResult } from '../pages/attendance/lib'

/**
 * The attendance button without internet: the press is kept on the phone with its own time and
 * sent by itself when the internet is back. Each press has its own id, so the server counts it
 * once even if it arrives twice. A press the server refuses (e.g. kept too long) is dropped and
 * the person is told.
 */
export interface QueuedPunch { uuid: string; device_time: string }

const KEY = 'af-punch-queue'
const listeners = new Set<() => void>()

export function queued(): QueuedPunch[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedPunch[]
  } catch {
    return []
  }
}

function save(items: QueuedPunch[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Nothing more we can do on this phone.
  }
  listeners.forEach((fn) => fn())
}

export function onQueueChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function enqueue(item: QueuedPunch) {
  save([...queued(), item])
}

const toast = (text: string, tone: 'ok' | 'danger') => window.dispatchEvent(new CustomEvent('af-toast', { detail: { text, tone } }))

let flushing = false
/** Send what is waiting, oldest first. A network failure keeps the rest for later. */
export async function flushPunches(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const item of queued()) {
      let res: PunchResult
      try {
        res = await punch({ method: 'app', uuid: item.uuid, device_time: item.device_time, offline: true })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 401 || e.status === 429)) return
        res = { ok: false, status: 'error', message: e instanceof ApiError ? e.message : 'حدث خطأ', wait_until: null, day: null }
      }
      save(queued().filter((q) => q.uuid !== item.uuid))
      if (res.ok) toast(`أُرسل تسجيل ${res.day?.check_out ? 'الانصراف' : 'الحضور'} الذي حُفظ دون إنترنت`, 'ok')
      else if (res.status !== 'repeat' && res.status !== 'full') toast(`لم يُقبل تسجيل محفوظ: ${res.message}`, 'danger')
    }
  } finally {
    flushing = false
  }
}

export function startPunchQueue() {
  window.addEventListener('online', () => void flushPunches())
  window.setInterval(() => void flushPunches(), 20_000)
  void flushPunches()
}
