const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 转义插入 HTML 模板的动态文本，防止笔记标题/标签/用户名里的
 * `<script>` 等内容被当成标记渲染（邮件客户端同样需要防注入）。
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/** 标签数组 → 转义后的 "#tag" 列表 */
export function escapeTags(tags: unknown): string {
  if (!Array.isArray(tags)) return ''
  return tags.map((t) => `#${escapeHtml(t)}`).join(' ')
}
