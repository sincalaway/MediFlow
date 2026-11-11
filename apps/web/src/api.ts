import { router } from './router'

const BASE = '/api'
const TOKEN_KEY = 'mediflow_token'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

type Query = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return `${BASE}${path}${s ? `?${s}` : ''}`
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(buildUrl(path, query), { method, headers, body: payload })
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const msg = (data as { message?: string })?.message || `请求失败（${res.status}）`
    const code = (data as { code?: string })?.code
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      tokenStore.clear()
      if (router.currentRoute.value.name !== 'login')
        router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    if (res.status === 428 && code === 'MUST_CHANGE_PASSWORD') router.push({ name: 'change-password' })
    throw new ApiError(res.status, msg, code)
  }
  return data as T
}

function safeJson(t: string) {
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  /** 带鉴权的文件下载 */
  async download(path: string, query?: Query, fallbackName = 'download') {
    const token = tokenStore.get()
    const res = await fetch(buildUrl(path, query), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const d = safeJson(await res.text())
      throw new ApiError(res.status, (d as { message?: string })?.message || '下载失败')
    }
    const cd = res.headers.get('content-disposition') || ''
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  },
}
