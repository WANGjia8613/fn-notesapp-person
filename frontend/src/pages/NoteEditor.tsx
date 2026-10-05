import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { notesApi, workspaceApi, authApi, attachmentApi } from '../api'
import NoteSidebar from '../components/NoteSidebar'

const tabBtn: React.CSSProperties = {
  padding: '6px 14px',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
}

// mermaid 改为动态 import：它连同 elk / cytoscape / katex 等依赖体积超过 2MB，
// 顶层静态引入会让首屏主包涨到 1MB 以上，而绝大多数笔记根本不含 mermaid 代码块。
// 只有真正渲染到 ```mermaid 时才去加载，首次渲染会多一次网络往返（已加 loading 态）。
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default
      mermaid.initialize({ startOnLoad: false, theme: 'default' })
      return mermaid
    })
  }
  return mermaidPromise
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
          if (containerRef.current) containerRef.current.innerHTML = svg
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

export default function NoteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [title, setTitle] = useState('')
  const [bodyMd, setBodyMd] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dueAt, setDueAt] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [candidates, setCandidates] = useState<{ id: string; name: string; email?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 团队成员列表（用于私有笔记的共享选择，排除自己）
  useEffect(() => {
    Promise.all([workspaceApi.members(), authApi.me()])
      .then(([members, me]) => setCandidates(members.filter((m) => m.id !== me.id)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (id) {
      notesApi
        .get(id)
        .then((note) => {
          setTitle(note.title)
          setBodyMd(note.bodyMd || '')
          setTags(note.tags)
          setDueAt(note.dueAt ? note.dueAt.slice(0, 16) : '')
          setRemindAt(note.remindAt ? note.remindAt.slice(0, 16) : '')
          setIsPrivate(note.isPrivate)
          setMemberIds((note.members ?? []).map((m) => m.userId))
        })
        .catch((e) => setError(e.message))
    }
  }, [id])

  const save = async () => {
    if (!title.trim()) {
      setError('标题不能为空')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        title,
        bodyMd,
        tags,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        remindAt: remindAt ? new Date(remindAt).toISOString() : null,
        isPrivate,
        memberIds: isPrivate ? memberIds : [],
      }
      const saved = isNew ? await notesApi.create(payload) : await notesApi.update(id!, payload)
      if (isNew) {
        navigate(`/notes/${saved.id}`)
      } else {
        // 保存成功轻提示
        const btn = document.getElementById('save-toast')
        if (btn) {
          btn.textContent = '已保存 ✓'
          setTimeout(() => (btn.textContent = '保存'), 1500)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id) return
    if (!confirm('确定删除这篇笔记？')) return
    try {
      await notesApi.remove(id)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const att = await attachmentApi.upload(file, id)
      const url = `/api/attachments/${att.id}/download`
      const md = att.mimeType.startsWith('image/')
        ? `![${att.filename}](${url})`
        : `[${att.filename}](${url})`
      setBodyMd((prev) => {
        const sep = prev === '' || prev.endsWith('\n') ? '' : '\n'
        return prev + sep + md + '\n'
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="editor-layout animate-in">
      <div className="glass-card" style={{ flex: 1, minWidth: 340, padding: 24 }}>
        {/* 标签切换 + 操作按钮 */}
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
          <div style={{ flex: 1 }} />
          <button id="save-toast" onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? '保存中...' : '💾 保存'}
          </button>
          {!isNew && (
            <button onClick={remove} className="btn-danger btn-sm">
              🗑️ 删除
            </button>
          )}
        </div>

        {/* 标题输入 */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题"
          style={{
            width: '100%',
            fontSize: 24,
            fontWeight: 700,
            border: 'none',
            outline: 'none',
            marginBottom: 16,
            padding: '6px 0',
            background: 'transparent',
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}
        />

        {error && (
          <div
            style={{
              color: '#dc2626',
              marginBottom: 12,
              fontSize: 13,
              background: 'rgba(220,38,38,0.08)',
              padding: '10px 14px',
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

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
            onChange={(e) => setBodyMd(e.target.value)}
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
      </div>

      <NoteSidebar
        tags={tags}
        setTags={setTags}
        dueAt={dueAt}
        setDueAt={setDueAt}
        remindAt={remindAt}
        setRemindAt={setRemindAt}
        isPrivate={isPrivate}
        setIsPrivate={setIsPrivate}
        memberIds={memberIds}
        setMemberIds={setMemberIds}
        candidates={candidates}
      />
    </div>
  )
}
