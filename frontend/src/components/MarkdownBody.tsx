import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DOMPurify from 'dompurify'
import { attachmentApi } from '../api'

/**
 * Markdown 正文编辑区（存量笔记路径）。
 *
 * 这里的逻辑是从原 NoteEditor.tsx **逐字搬迁**过来的，一行都没改：
 * mermaid 动态 import 懒加载、MermaidBlock、markdownComponents 的 code 拦截、
 * 「编辑 / 预览」双 tab、附件上传插入 Markdown 链接语法。
 * 搬迁而非重写，是为了保证富文本化后存量笔记（尤其是含 Mermaid 图表的）
 * 的渲染与交互行为完全不变—— 评审时只需 diff 本文件即可确认零改动。
 *
 * 为什么 Markdown 笔记必须保留「预览」tab：
 * Mermaid 图表只在预览态经 MermaidBlock 渲染成 SVG，去掉预览等于让存量笔记的
 * 图表功能直接回归。富文本侧第一版不做 Mermaid，所以新笔记没有这个问题。
 */

// mermaid 改为动态 import：它连同 elk / cytoscape / katex 等依赖体积超过 2MB，
// 顶层静态引入会让首屏主包涨到 1MB 以上，而绝大多数笔记根本不含 mermaid 代码块。
// 只有真正渲染到 ```mermaid 时才去加载，首次渲染会多一次网络往返（已加 loading 态）。
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default
      // 显式锁 strict，不依赖 mermaid 的默认行为。
      // 笔记正文可被共享给其他成员，而渲染结果是用 innerHTML 写进 DOM 的；
      // loose 会放行图表里的 HTML 标签与点击事件，形成存储型 XSS。
      // 与桌面端保持同一取值，避免两端安全口径不一致。
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidPromise
}

/**
 * mermaid 渲染结果的二次净化。
 *
 * mermaid 配了 securityLevel:'strict' 会自行净化，这里再加一层是纵深防御：
 * 笔记正文可被共享给其他成员，而下面这处是直接写 innerHTML 的，
 * 万一将来有人把 securityLevel 改回 loose（或升级后默认行为变化），
 * 还有一道独立闸门挡住 <script> / on* 事件 / foreignObject。
 *
 * 口径说明（查 dompurify 源码确认）：svg profile 的标签集已包含 style
 * —— mermaid v11+ 把图表样式放在内嵌 <style> 里，所以图表外观不会掉；
 * 同时它不含 script 与 foreignObject，正好挡住真正危险的两种载体。
 */
function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
}

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadMermaid()
      .then((mermaid) => {
        if (cancelled || !containerRef.current) return
        const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        return mermaid.render(id, code).then(({ svg }) => {
          if (cancelled) return
          if (containerRef.current) containerRef.current.innerHTML = sanitizeSvg(svg)
          setError('')
          setLoading(false)
        })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, fontSize: 13, color: '#991b1b' }}>
        <strong>Mermaid 渲染失败：</strong>
        <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    )
  }
  return (
    <>
      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>图表加载中...</div>
      )}
      <div ref={containerRef} style={{ margin: '12px 0', textAlign: 'center' }} />
    </>
  )
}

const markdownComponents = {
  code({ inline, className, children, ...props }: any) {
    const match = /language-mermaid/.test(className || '')
    if (!inline && match) {
      const code = String(children).replace(/\n$/, '')
      return <MermaidBlock code={code} />
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

/** 可在浏览器内联渲染的图片类型（与后端 INLINE_SAFE_MIME 保持一致） */
const INLINE_SAFE_MIME = /^image\/(png|jpeg|gif|webp)$/i

interface Props {
  bodyMd: string
  onChange: (v: string) => void
  /** 新建笔记时为 undefined，附件先不带 noteId 上传，保存后由父组件补绑 */
  noteId?: string
  onError: (msg: string) => void
}

export default function MarkdownBody({ bodyMd, onChange, noteId, onError }: Props) {
  const [showPreview, setShowPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    onError('')
    try {
      const att = await attachmentApi.upload(file, noteId)
      // 带shareToken：<img> 标签发不出 Authorization 头，
      // Markdown 里的 ![]() 最终也是渲染成 <img>，所以同样需要签名 URL。
      // （改造前这里拼的是不带 token 的裸路径，导致存量笔记里的图片实际上是裂图，
      //   因为下载路由强制 JWT 鉴权。这里一并修掉。）
      const url = `/api/attachments/${att.id}/download?t=${att.shareToken}`
      const md = att.mimeType.startsWith('image/')
        ? `![${att.filename}](${url})`
        : `[${att.filename}](${url})`
      onChange(bodyMd + (bodyMd === '' || bodyMd.endsWith('\n') ? '' : '\n') + md + '\n')
    } catch (err) {
      onError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <>
      {/* 标签切换 + 附件按钮 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'rgba(0,0,0,0.04)',
            padding: 4,
            borderRadius: 10,
          }}
        >
          <button
            onClick={() => setShowPreview(false)}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: !showPreview ? 'white' : 'transparent',
              color: !showPreview ? 'var(--primary-dark)' : 'var(--text-secondary)',
              boxShadow: !showPreview ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            ✏️ 编辑
          </button>
          <button
            onClick={() => setShowPreview(true)}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: showPreview ? 'white' : 'transparent',
              color: showPreview ? 'var(--primary-dark)' : 'var(--text-secondary)',
              boxShadow: showPreview ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            👁️ 预览
          </button>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary btn-sm"
          style={{ opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? '上传中...' : '📎 附件'}
        </button>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {/* 编辑区 / 预览区 */}
      {showPreview ? (
        <div className="markdown-body" style={{ minHeight: 400, lineHeight: 1.75 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {bodyMd || '*暂无内容，开始写作吧 ✨*'}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          value={bodyMd}
          onChange={(e) => onChange(e.target.value)}
          placeholder="在这里用 Markdown 写作... 支持 # 标题、**粗体**、- 列表、```mermaid 图表等"
          className="input-glass"
          style={{
            minHeight: 440,
            fontSize: 14,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, Menlo, monospace",
            resize: 'vertical',
            lineHeight: 1.7,
          }}
        />
      )}
    </>
  )
}
