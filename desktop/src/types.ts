export interface User {
  id: string
  email: string
  name: string
  role: string
  workspaceId: string
  workspaceName?: string
  createdAt?: string
}

export interface NoteMemberRef {
  userId: string
  user?: { id: string; name: string; email?: string }
}

export interface Note {
  id: string
  title: string
  bodyMd?: string
  bodyFormat?: 'markdown' | 'html'
  bodyJson?: string
  bodyHtml?: string
  bodyText?: string
  tags: string[]
  dueAt: string | null
  remindAt: string | null
  isPrivate: boolean
  authorId?: string
  createdAt: string
  updatedAt: string
  author?: { name: string; email?: string }
  members?: NoteMemberRef[]
}

export interface Invitation {
  id: string
  email: string | null
  token: string
  expiresAt: string
  status: string
  createdAt: string
  inviteLink?: string
}

export interface SummaryConfig {
  id?: string
  frequency: 'daily' | 'weekly'
  time: string
  enabled: boolean
}

export interface ReminderRecord {
  id: string
  type: string
  title: string
  triggerAt: string
  status: string
  sentAt: string | null
  note?: { title: string } | null
}

export interface WebhookConfig {
  id: string
  name: string
  url: string
  type: 'feishu' | 'dingtalk' | 'wecom' | 'generic'
  enabled: boolean
  createdAt: string
}

export interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
  storagePath: string
  shareToken: string
  createdAt: string
  uploadedBy?: { name: string }
}

export interface LlmConfig {
  id?: string
  provider: 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'ollama' | 'custom'
  baseUrl: string
  model: string
  enabled: boolean
  apiKeySet: boolean
}

export interface AiSummaryConfig {
  id?: string
  enabled: boolean
  channels: ('email' | 'webhook')[]
  weekday: number
  time: string
  prompt: string
}
