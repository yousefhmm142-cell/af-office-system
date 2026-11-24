import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOnline } from '../lib/useOnline'

/** «بدون إنترنت» across the top while the phone is offline. */
export function OfflineBar() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="af-bar warn" role="status" aria-live="polite">
      <CloudOff size={17} aria-hidden="true" />
      <span><b>بدون إنترنت</b> · زر الحضور شغّال وبيحفظ على جوالك. باقي الصفحات بدها نت.</span>
    </div>
  )
}

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()
let updateReady = false

/** Called from main.tsx when the app was registered for offline use. */
export function setUpdater(fn: (reload?: boolean) => Promise<void>) {
  applyUpdate = fn
}
export function markUpdateReady() {
  updateReady = true
  listeners.forEach((l) => l())
}

/** A new version is out: a small bar with a button. The page never reloads by itself. */
export function UpdateBar() {
  const [ready, setReady] = useState(updateReady)
  useEffect(() => {
    const l = () => setReady(true)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  if (!ready) return null
  return (
    <div className="af-bar info" role="status">
      <RefreshCw size={17} aria-hidden="true" />
      <span>في تحديث جديد للنظام.</span>
      <button type="button" className="link-btn" onClick={() => void applyUpdate?.(true)}>تحديث الآن</button>
    </div>
  )
}
