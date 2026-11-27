import { Moon, Sun } from 'lucide-react'
import { flushSync } from 'react-dom'
import { setThemeFrom, useTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme] = useTheme()
  const label = theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'
  return (
    <button type="button" className="icon-btn theme-toggle" data-theme-now={theme} aria-label={label} title={label}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setThemeFrom(theme === 'dark' ? 'light' : 'dark', r.left + r.width / 2, r.top + r.height / 2, (u) => flushSync(u))
      }}>
      <span className="theme-ico theme-sun" aria-hidden="true"><Sun size={18} /></span>
      <span className="theme-ico theme-moon" aria-hidden="true"><Moon size={18} /></span>
    </button>
  )
}
