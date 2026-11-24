import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, onApiStatus, setToken } from '../api/client'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  const refresh = useCallback(async () => {
    if (!getToken()) {
      const s = await api<{ needed: boolean }>('/setup').catch(() => ({ needed: false }))
      setState(s.needed ? { status: 'setup' } : { status: 'signed_out' })
      return
    }
    try {
      const { user } = await api<{ user: User }>('/me')
      setState({ status: 'signed_in', user })
    } catch {
      if (!getToken()) setState({ status: 'signed_out' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    // A token the server no longer accepts (stopped account, password changed elsewhere): back to sign-in.
    return onApiStatus((status) => {
      if (status === 401) {
        setToken(null)
        setState({ status: 'signed_out' })
      }
    })
  }, [refresh])

  const value = useMemo<Auth>(() => ({
    state,
    refresh,
    async signIn(username, password) {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { username, password, device_name: navigator.userAgent.slice(0, 80) } })
      setToken(res.token)
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
      setState({ status: 'signed_out' })
    },
    setUser(user) {
      setState({ status: 'signed_in', user })
    },
  }), [state, refresh])

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
