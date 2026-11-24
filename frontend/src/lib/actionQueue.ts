import { api, ApiError } from '../api/client'

/**
 * Task buttons pressed without internet: kept on the phone with their time and sent in order when
 * the internet is back. Each has its own id, so the server counts it once.
 */
export interface QueuedAction { id: string; path: string; body: Record<string, unknown>; at: string; label: string }

const KEY = 'af-action-queue'
const listeners = new Set<() => void>()

export function queuedActions(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedAction[]
  } catch {
    return []
  }
}
function save(items: QueuedAction[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* not kept */ }
  listeners.forEach((l) => l())
}
export const onActionsChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

/** Try now; without internet keep it for later. Returns the server answer, or null when queued. */
export async function sendOrQueue<T>(path: string, body: Record<string, unknown>, label: string): Promise<T | null> {
  const id = crypto.randomUUID()
  const at = new Date().toISOString()
  if (navigator.onLine) {
    try {
      return await api<T>(path, { method: 'POST', body: { ...body, operation: id } })
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) throw e
    }
  }
  save([...queuedActions(), { id, path, body: { ...body, operation: id, offline: true, device_time: at }, at, label }])
  return null
}

const toast = (text: string, tone: 'ok' | 'danger') => window.dispatchEvent(new CustomEvent('af-toast', { detail: { text, tone } }))
let flushing = false
export async function flushActions() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const a of queuedActions()) {
      try {
        await api(a.path, { method: 'POST', body: a.body })
        toast(`أُرسل: ${a.label}`, 'ok')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429 || e.status === 401)) return
        toast(`لم يُقبل «${a.label}»: ${e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'خطأ'}`, 'danger')
      }
      save(queuedActions().filter((q) => q.id !== a.id))
    }
  } finally {
    flushing = false
  }
}
export function startActionQueue() {
  window.addEventListener('online', () => void flushActions())
  window.setInterval(() => void flushActions(), 20_000)
  void flushActions()
}
