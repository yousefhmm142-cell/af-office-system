import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, getToken, onApiStatus, setToken } from '../api/client'
import type { Scope, User } from '../api/types'

type State =
  | { status: 'loading' }
  | { status: 'setup' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: User }

interface Auth {
  state: State
  signIn(username: string, password: string): Promise<void>
  setup(body: { name: string; username: string; password: string; password_confirmation: string }): Promise<void>
  signOut(): Promise<void>
  refresh(): Promise<void>
  setUser(user: User): void
}

const AuthContext = createContext<Auth | null>(null)

// The last known account, so the app opens signed in even without internet.
const USER_KEY = 'af-user'
function cachedUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as User | null
  } catch {
    return null
  }
}
function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // Not kept.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  /** Signed out: a brand-new database opens on «تجهيز النظام» instead of the sign-in form. */
  const signedOut = useCallback(async () => {
    const s = await api<{ needed: boolean }>('/setup').catch(() => ({ needed: false }))
    setState(s.needed ? { status: 'setup' } : { status: 'signed_out' })
  }, [])

  const refresh = useCallback(async () => {
    if (!getToken()) {
      await signedOut()
      return
    }
    try {
      const { user } = await api<{ user: User }>('/me')
      cacheUser(user)
      setState({ status: 'signed_in', user })
    } catch (e) {
      const cached = cachedUser()
      if (getToken() && cached && e instanceof ApiError && (e.status === 0 || e.status >= 500)) setState({ status: 'signed_in', user: cached })
      else if (!getToken()) setState({ status: 'signed_out' })
      else if (e instanceof ApiError && e.status === 403) setState(cached ? { status: 'signed_in', user: cached } : { status: 'signed_out' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    // A token the server no longer accepts (stopped account, password changed elsewhere): back to sign-in.
    return onApiStatus((status) => {
      if (status === 401) {
        setToken(null)
        cacheUser(null)
        void signedOut()
      }
    })
  }, [refresh, signedOut])

  const value = useMemo<Auth>(() => ({
    state,
    refresh,
    async signIn(username, password) {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { username, password, device_name: navigator.userAgent.slice(0, 80) } })
      setToken(res.token)
      cacheUser(res.user)
      setState({ status: 'signed_in', user: res.user })
    },
    async setup(body) {
      const res = await api<{ token: string; user: User }>('/setup', { method: 'POST', body })
      setToken(res.token)
      setState({ status: 'signed_in', user: res.user })
    },
    async signOut() {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
      setToken(null)
      cacheUser(null)
      await signedOut()
    },
    setUser(user) {
      cacheUser(user)
      setState({ status: 'signed_in', user })
    },
  }), [state, refresh, signedOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider missing')
  return ctx
}

export function useUser(): User {
  const { state } = useAuth()
  if (state.status !== 'signed_in') throw new Error('Not signed in')
  return state.user
}

export function scopeOf(user: User, permission: string): Scope | null {
  return user.permissions?.[permission] ?? null
}
export const can = (user: User, permission: string) => scopeOf(user, permission) !== null
