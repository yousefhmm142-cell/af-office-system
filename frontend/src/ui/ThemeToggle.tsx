import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const label = theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
