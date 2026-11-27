import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'af-theme'
const listeners = new Set<() => void>()
const barColor: Record<Theme, string> = { light: '#F3F1EE', dark: '#07080A' }

const read = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor[theme])
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not saved, still applied.
  }
  listeners.forEach((fn) => fn())
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    read,
  )
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}

type ViewTransition = { ready: Promise<void> }
type WithTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition }

/**
 * Switches the theme with a circle that grows out of (x, y) until it covers the screen.
 * Falls back to a plain switch where the browser has no view transitions or the person
 * asked for less motion.
 */
export function setThemeFrom(theme: Theme, x: number, y: number, apply: (update: () => void) => void = (u) => u()) {
  const doc = document as WithTransitions
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || still) {
    setTheme(theme)
    return
  }
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  document.documentElement.classList.add('theme-switching')
  const t = doc.startViewTransition(() => apply(() => setTheme(theme)))
  t.ready.then(() => {
    const anim = document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
    )
    anim.finished.finally(() => document.documentElement.classList.remove('theme-switching'))
  }).catch(() => document.documentElement.classList.remove('theme-switching'))
}
