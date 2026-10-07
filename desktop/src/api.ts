import type {
  User, Note, Invitation, SummaryConfig, ReminderRecord,
  WebhookConfig, Attachment, LlmConfig, AiSummaryConfig,
} from './types'

// ============================================================
// API 基址策略（桌面版核心改造点）
// - Electron 壳内：请求走本地反向代理 http://127.0.0.1:<proxyPort>，
//   由主进程转发到用户配置的 NAS，规避浏览器 CORS，NAS 后端零改动。
// - 纯浏览器调试（无 window.desktop）：退回相对路径 /api，配合 Vite proxy。
// ============================================================
let cachedProxyPort: number | null = null

export async function getApiBase(): Promise<string> {
  if (window.desktop?.isDesktop) {
    if (cachedProxyPort) return `http://127.0.0.1:${cachedProxyPort}/api`
    const cfg = await window.desktop.getConfig()
    cachedProxyPort = cfg.proxyPort || 0
    return `http://127.0.0.1:${cachedProxyPort}/api`
  }
  return '/api'
}

function getToken(): string | null {
  return localStorage.getItem('token')
}
export function setToken(token: string) {
  localStorage.setItem('token', token)
}
export function clearToken() {
  localStorage.removeItem('token')
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = await getApiBase()
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  // FormData 时让浏览器自动设置 Content-Type（含 multipart boundary）
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${base}${path}`, { ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `请求失败: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// 附件下载/图片签名 URL：同样需要带代理基址
export async function attachmentUrl(id: string, shareToken: string): Promise<string> {
  const base = await getApiBase()
  return `${base}/attachments/${id}/download?t=${encodeURIComponent(shareToken)}`
}

// ========== 认证 ==========
export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (token: string, name: string, password: string) =>
    api<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ token, name, password }),
    }),
  me: () => api<User>('/auth/me'),
  verifyInvitation: (token: string) =>
    api<{ email: string; workspaceName: string; expiresAt: string }>(`/invitations/verify/${token}`),
}

// ========== 笔记 ==========
export const notesApi = {
  list: (params?: { tag?: string; onlyDue?: boolean; q?: string }) => {
    const qs = new URLSearchParams()
    if (params?.tag) qs.set('tag', params.tag)
    if (params?.onlyDue) qs.set('onlyDue', 'true')
    if (params?.q) qs.set('q', params.q)
    const q = qs.toString()
    return api<Note[]>(`/notes${q ? `?${q}` : ''}`)
  },
  get: (id: string) => api<Note>(`/notes/${id}`),
  create: (data: Partial<Note> & { memberIds?: string[] }) =>
    api<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Note> & { memberIds?: string[] }) =>
    api<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => api<{ success: boolean }>(`/notes/${id}`, { method: 'DELETE' }),
}

// ========== 团队 ==========
export const workspaceApi = {
  current: () => api<{ id: string; name: string }>('/workspaces/current'),
  members: () => api<User[]>('/workspaces/members'),
}

// ========== 邀请 ==========
export const invitationApi = {
  list: () => api<Invitation[]>('/invitations'),
  create: (email: string, expiresInDays = 7) =>
    api<Invitation>('/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, expiresInDays }),
    }),
  revoke: (id: string) => api<{ success: boolean }>(`/invitations/${id}`, { method: 'DELETE' }),
}

// ========== 汇总配置 ==========
export const summaryApi = {
  getConfig: () => api<{ daily: SummaryConfig; weekly: SummaryConfig }>('/summary/config'),
  updateConfig: (data: { frequency: string; time?: string; enabled?: boolean }) =>
    api<SummaryConfig>('/summary/config', { method: 'PUT', body: JSON.stringify(data) }),
}

// ========== 提醒 ==========
export const reminderApi = {
  list: (status?: string) => {
    const q = status ? `?status=${status}` : ''
    return api<ReminderRecord[]>(`/reminders${q}`)
  },
  testEmail: () =>
    api<{ ok: boolean; mode: string; messageId?: string; error?: string }>('/reminders/test-email', {
      method: 'POST',
    }),
  /** 后端是否配置了 SMTP。未配置时提醒必然失败，前端据此给出明确提示 */
  mailStatus: () => api<{ configured: boolean }>('/reminders/mail-status'),
}

// ========== 日历订阅 ==========
export const calendarApi = {
  getSubscribeUrl: () => api<{ url: string; token: string }>('/calendar/subscribe'),
}

// ========== Webhook ==========
export const webhookApi = {
  list: () => api<WebhookConfig[]>('/webhooks'),
  create: (data: { name: string; url: string; type: string; enabled?: boolean }) =>
    api<WebhookConfig>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<WebhookConfig>) =>
    api<WebhookConfig>(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => api<{ success: boolean }>(`/webhooks/${id}`, { method: 'DELETE' }),
}

// ========== 附件 ==========
export const attachmentApi = {
  upload: (file: File, noteId?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (noteId) form.append('noteId', noteId)
    return api<Attachment>('/attachments', { method: 'POST', body: form })
  },
  list: (noteId?: string) => {
    const q = noteId ? `?noteId=${noteId}` : ''
    return api<Attachment[]>(`/attachments${q}`)
  },
  bindToNote: (attachmentId: string, noteId: string) =>
    api<{ success: boolean }>(`/attachments/${attachmentId}/note`, {
      method: 'PUT',
      body: JSON.stringify({ noteId }),
    }),
  remove: (id: string) => api<{ success: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
}

// ========== LLM 配置 ==========
export const llmApi = {
  getConfig: () => api<LlmConfig | null>('/llm/config'),
  updateConfig: (data: Partial<LlmConfig> & { apiKey?: string }) =>
    api<LlmConfig>('/llm/config', { method: 'PUT', body: JSON.stringify(data) }),
  test: () => api<{ ok: boolean; error?: string; preview?: string }>('/llm/test', { method: 'POST' }),
}

// ========== AI 周总结 ==========
export const aiSummaryApi = {
  getConfig: () => api<{ config: AiSummaryConfig; llmConfigured: boolean }>('/ai-summary/config'),
  updateConfig: (data: Partial<AiSummaryConfig>) =>
    api<AiSummaryConfig>('/ai-summary/config', { method: 'PUT', body: JSON.stringify(data) }),
  generateNow: () => api<{ ok: boolean; reason?: string }>('/ai-summary/generate-now', { method: 'POST' }),
}
