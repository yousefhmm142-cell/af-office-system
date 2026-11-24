import { config } from '../config'

const TOKEN_KEY = 'af-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Kept only for this visit.
  }
}

/** A refusal from the server, with its message in plain Arabic and the first error of each field. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

type Listener = (status: number, code?: string) => void
const listeners = new Set<Listener>()
/** The auth layer listens for "signed out" (401) and "change your password first". */
export function onApiStatus(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const isForm = options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(config.apiBase + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'ما في اتصال بالسيرفر. تأكد من الإنترنت وجرّب كمان مرة.', 'offline')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries((data.errors ?? {}) as Record<string, string[]>)) fields[k] = v[0] ?? ''
    const err = new ApiError(res.status, data.message || 'صار خطأ. جرّب كمان مرة.', data.code, fields)
    listeners.forEach((fn) => fn(res.status, data.code))
    throw err
  }
  return data as T
}

/** A protected file (an attachment), opened in a new tab without putting the token in a link. */
export async function openFile(path: string) {
  const tab = window.open('', '_blank')
  const res = await fetch(config.apiBase + path, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
  if (!res.ok) {
    tab?.close()
    throw new ApiError(res.status, 'ما قدرنا نفتح الملف.')
  }
  const url = URL.createObjectURL(await res.blob())
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
