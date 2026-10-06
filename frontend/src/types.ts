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
  /** 存量 Markdown 正文。bodyFormat='html' 时后端强制为 '' */
  bodyMd?: string
  /** 正文格式：markdown 走 react-markdown + Mermaid；html 走 TipTap 富文本 */
  bodyFormat?: 'markdown' | 'html'
  /** ProseMirror JSON，富文本笔记的编辑真源 */
  bodyJson?: string
  /** 由 bodyJson 派生的 HTML 冗余投影，渲染不依赖它（以 JSON 为准） */
  bodyHtml?: string
  /** 纯文本投影，后端派生。列表/搜索场景不需要，详情接口会带 */
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
  /** 图片签名 URL 用：拼成 /api/attachments/{id}/download?t={shareToken} 直接给 <img> */
  shareToken: string
  createdAt: string
  uploadedBy?: { name: string }
}

/** LLM 配置（workspace 级，由 owner/admin 管理）。apiKey 永远不返回明文。 */
export interface LlmConfig {
  id?: string
  provider: 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'ollama' | 'custom'
  baseUrl: string
  model: string
  enabled: boolean
  /** 是否已配置 API Key（前端拿不到明文） */
  apiKeySet: boolean
}

/** AI 周总结配置（用户级） */
export interface AiSummaryConfig {
  id?: string
  enabled: boolean
  /** 发送渠道，可多选：email / webhook */
  channels: ('email' | 'webhook')[]
  /** 周几发送：0=周日 1=周一 ... 6=周六 */
  weekday: number
  /** 发送时间 HH:MM */
  time: string
  /** 自定义提示词，留空用系统默认 */
  prompt: string
}
