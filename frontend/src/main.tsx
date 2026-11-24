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
