import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import DOMPurify from 'dompurify'
import { motion, AnimatePresence } from 'framer-motion'
import { attachmentApi } from '../api'
import type { Attachment } from '../types'
import { useToast } from './Toast'

// securityLevel 必须显式锁在 strict。
// 原因：笔记正文是**用户可控内容**，且私有笔记可以共享给其他成员，
// 下面又是用 dangerouslySetInnerHTML 把 mermaid 生成的 SVG 直接注入 DOM。
// loose 模式允许图表里带 HTML 标签与 click 回调，等于给任何能编辑共享笔记的人
// 一条存储型 XSS 通路：受害者打开预览即执行脚本，localStorage 里的 JWT 直接被读走。
// 代价是 strict 会禁用 htmlLabels（部分图表内的富文本排版会退化成纯文本），
// 用这点排版损失换掉一个可窃取凭据的漏洞，是明确划算的。
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })

interface Props {
  bodyMd: string
  onChange: (v: string) => void
  noteId?: string
  onError?: (msg: string) => void
}

/**
 * mermaid 渲染结果的二次净化。
 *
 * 这一层是刻意加的：上面虽然把 securityLevel 锁在 strict，但渲染出口用的是
 * dangerouslySetInnerHTML，一旦有人为图省事把 securityLevel 改回 loose，
 * 或 mermaid 升级后默认行为变化，就必须还有一道独立闸门。
 *
 * 口径说明（查 dompurify 源码确认）：svg profile 的标签集已包含 style
 * —— mermaid v11+ 把图表样式放在内嵌 <style> 里，所以图表外观不会掉；
 * 同时它不含 script 与 foreignObject，正好挡住真正危险的两种载体。
 */
function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
}

// Mermaid 代码块：把 ```mermaid 围栏内容渲染成图
function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = 'mmd-' + Math.random().toString(36).slice(2)
    mermaid
      .render(id, code)
      .then((r) => {
        if (!cancelled) {
          setSvg(r.svg)
          setErr('')
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'Mermaid 渲染失败')
      })
    return () => {
      cancelled = true
      document.getElementById('d' + id)?.remove()
    }
  }, [code])

  if (err) {
    return (
      <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: 13, margin: '14px 0' }}>
        ⚠️ {err}
      </div>
    )
  }
  return <div ref={ref} style={{ textAlign: 'center', margin: '14px 0' }} dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} />
}

export default function MarkdownBody({ bodyMd, onChange, noteId, onError }: Props) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingAtt, setUploadingAtt] = useState(false)
  const toast = useToast()
  const attInputRef = useRef<HTMLInputElement | null>(null)

  const loadAttachments = () => {
    if (!noteId) return
    attachmentApi.list(noteId).then(setAttachments).catch(() => {})
  }
  useEffect(() => {
    loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // 附件上传
  const onAttChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAtt(true)
    try {
      await attachmentApi.upload(file, noteId)
      toast.success('附件已上传')
      loadAttachments()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败'
      toast.error(msg)
      onError?.(msg)
    } finally {
      setUploadingAtt(false)
      if (attInputRef.current) attInputRef.current.value = ''
    }
  }

  const removeAtt = async (id: string) => {
    try {
      await attachmentApi.remove(id)
      setAttachments((a) => a.filter((x) => x.id !== id))
    } catch {
      toast.error('删除失败')
    }
  }

  // 预览态渲染
  const preview = useMemo(() => {
    if (tab !== 'preview') return null
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28 }}
        className="markdown-body"
        style={{ minHeight: 440, maxHeight: '70vh', overflowY: 'auto', padding: '4px 2px' }}
      >
        {bodyMd.trim() ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...rest }) {
                const match = /language-(\w+)/.exec(className || '')
                const code = String(children).replace(/\n$/, '')
                if (match && match[1] === 'mermaid') {
                  return <MermaidBlock code={code} />
                }
                // 围栏代码块（有 language- 前缀且非行内）
                const isBlock = className && /language-/.test(className)
                if (isBlock) {
                  return (
                    <pre>
                      <code className={className} {...rest}>{children}</code>
                    </pre>
                  )
                }
                return <code className={className} {...rest}>{children}</code>
              },
            }}
          >
            {bodyMd}
          </ReactMarkdown>
        ) : (
          <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>暂无内容，切到「编辑」开始书写</div>
        )}
      </motion.div>
    )
  }, [tab, bodyMd])

  return (
    <div>
      {/* 编辑/预览 tab + 附件按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="md-tabs" style={{ marginBottom: 0 }}>
          {(['edit', 'preview'] as const).map((t) => (
            <button key={t} className={'md-tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
              {t === 'edit' ? '✏️ 编辑' : '👁 预览'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-secondary btn-sm" disabled={uploadingAtt} onClick={() => attInputRef.current?.click()}>
          {uploadingAtt ? '上传中…' : '📎 附件'}
        </button>
        <input ref={attInputRef} type="file" style={{ display: 'none' }} onChange={onAttChange} />
      </div>

      <AnimatePresence mode="wait">
        {tab === 'edit' ? (
          <motion.textarea
            key="edit"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="md-textarea"
            value={bodyMd}
            placeholder="用 Markdown 书写… 支持 ```mermaid 图表"
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {preview}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 16, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>📎 附件（{attachments.length}）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.5)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(a.size / 1024).toFixed(1)} KB</span>
                <button onClick={() => removeAtt(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }} title="删除">✕</button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
