import type { User, Note, Invitation, SummaryConfig, ReminderRecord, WebhookConfig, Attachment } from './types'

const API_BASE = '/api'

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
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  // FormData 时让浏览器自动设置 Content-Type（含 multipart boundary）
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `请求失败: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
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
  create: (data: Partial<Note>) =>
    api<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Note>) =>
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
  /**
   * 把「笔记创建前上传」的附件补挂到笔记上。
   * 新建笔记时 noteId 还不存在，附件先以 noteId=null 上传，
   * 笔记创建成功后由编辑器回调本方法补绑（顺带修复既有游离附件缺陷）。
   */
  bindToNote: (attachmentId: string, noteId: string) =>
    api<{ success: boolean }>(`/attachments/${attachmentId}/note`, {
      method: 'PUT',
      body: JSON.stringify({ noteId }),
    }),
  remove: (id: string) => api<{ success: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
}
