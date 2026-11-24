import '@fontsource/almarai/300.css'
import '@fontsource/almarai/400.css'
import '@fontsource/almarai/700.css'
import '@fontsource/almarai/800.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/pages.css'
import './styles/forms.css'
import './styles/fx.css'
import './styles/shell2.css'
import './styles/af.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './app/auth'
import { router } from './app/router'
import { ConfirmProvider } from './ui/Confirm'
import { ToastProvider } from './ui/Toast'
import { registerSW } from 'virtual:pwa-register'
import { startPunchQueue } from './lib/punchQueue'
import { markUpdateReady, setUpdater } from './ui/NetBars'

// Keeps the app on the phone so it opens without internet. A new version waits for a button press.
setUpdater(registerSW({
  immediate: true,
  onNeedRefresh: markUpdateReady,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => void registration.update().catch(() => undefined)
    window.setInterval(check, 30 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
}))
// Ask the browser to keep this phone's copy (attendance waiting to be sent) when space runs short.
void navigator.storage?.persist?.().catch(() => undefined)
startPunchQueue()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
