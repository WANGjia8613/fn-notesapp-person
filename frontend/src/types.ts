export interface User {
  id: string
  email: string
  name: string
  role: string
  workspaceId: string
  workspaceName?: string
}

export interface NoteMemberRef {
  userId: string
  user?: { id: string; name: string; email?: string }
}

export interface Note {
  id: string
  title: string
  bodyMd?: string
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
  createdAt: string
  uploadedBy?: { name: string }
}
