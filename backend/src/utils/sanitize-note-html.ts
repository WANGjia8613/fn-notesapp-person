import sanitizeHtml from 'sanitize-html'

/**
 * 笔记正文的 HTML 净化。
 *
 * 为什么第一版就要做（而不是「等将来渲染到别的上下文再说」）：
 * bodyHtml 会落库，而**写接口是可直接用 JWT 调用的** —— 前端 TipTap 的 schema 白名单
 * 只是客户端约束，挡不住任何人自己构造一个 POST /api/notes 上传
 * `<img src=x onerror=alert(1)>`。一旦 bodyHtml 被落库，它就是一个常驻的存储型 XSS 弹仓，
 * 将来任何一处 v-html 渲染 / 邮件导出 / 全文导出都会引爆。
 * 与其把「将来记得净化」这种承诺写进注释，不如现在就把弹仓封死：
 * 之后新增任何渲染入口都默认安全，这是净化唯一的、也是充分的收益理由。
 *
 * 白名单与 TipTap schema 逐项对齐（StarterKit + Image + TaskList/TaskItem 的实际输出），
 * 多一分容忍将来就要多查一处，所以宁窄勿宽。
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    's',
    'u',
    'strike',
    'del',
    'code',
    'pre',
    'mark',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'span',
    'div',
    'label',
    'input', // 任务清单的勾选框
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    input: ['type', 'checked', 'disabled'],
    '*': ['class', 'data-type', 'data-checked'],
  },
  // 代码块语言标记必须放行，否则 ```mermaid 的 language-mermaid 类名会被剥掉，
  // 导致 Markdown 笔记转成富文本后图表信息丢失（本期虽不做转换，但历史数据要能安全迁移）
  allowedClasses: {
    '*': [/^language-[a-z0-9-]+$/, /^is-empty$/, /^is-editor-empty$/, /^rt-/],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // 外链一律新窗口 + noopener，杜绝 window.opener 劫持
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    }),
    img: (tagName, attribs) => {
      const src = String(attribs.src || '')
      // 只允许同源附件路由或 https。javascript:/data: 在这里被彻底堵死，
      // 即便将来有人把 allowedSchemes 改松，也还多一道闸。
      // 非法来源降级成空的 span，保留占位但不发起任何请求。
      if (!src.startsWith('/api/attachments/') && !/^https:\/\//i.test(src)) {
        return { tagName: 'span', attribs: {} }
      }
      return { tagName, attribs }
    },
  },
}

/** 净化笔记正文 HTML。空值返回空串。 */
export function sanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, OPTIONS)
}
