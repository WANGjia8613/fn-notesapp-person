import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { notesApi, attachmentApi } from '../api'
import NoteSidebar from '../components/NoteSidebar'

const tabBtn: React.CSSProperties = {
  padding: '6px 14px',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
}

mermaid.initialize({ startOnLoad: false, theme: 'default' })

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!containerRef.current) return
    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (containerRef.current) containerRef.current.innerHTML = svg
        setError('')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [code])

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, fontSize: 13, color: '#991b1b' }}>
        <strong>Mermaid 渲染失败：</strong>
        <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    )
  }
  return <div ref={containerRef} style={{ margin: '12px 0', textAlign: 'center' }} />
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
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 320, background: '#fff', border: '1px solid #e4e7eb', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <button
            onClick={() => setShowPreview(false)}
            style={{ ...tabBtn, background: !showPreview ? '#2563eb' : '#f1f5f9', color: !showPreview ? '#fff' : '#475569' }}
          >
            编辑
          </button>
          <button
            onClick={() => setShowPreview(true)}
            style={{ ...tabBtn, background: showPreview ? '#2563eb' : '#f1f5f9', color: showPreview ? '#fff' : '#475569' }}
          >
            预览
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ ...tabBtn, background: '#f1f5f9', color: '#475569', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading ? '上传中...' : '📎 附件'}
          </button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
          <div style={{ flex: 1 }} />
          <button
            id="save-toast"
            onClick={save}
            disabled={saving}
            style={{ padding: '6px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {!isNew && (
            <button
              onClick={remove}
              style={{ padding: '6px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 14 }}
            >
              删除
            </button>
          )}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题"
          style={{
            width: '100%',
            fontSize: 20,
            fontWeight: 600,
            border: 'none',
            outline: 'none',
            marginBottom: 12,
            padding: '4px 0',
          }}
        />

        {error && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 14 }}>{error}</div>}

        {showPreview ? (
          <div className="markdown-body" style={{ minHeight: 400, lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{bodyMd || '*暂无内容*'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            placeholder="在这里用 Markdown 写作..."
            style={{
              width: '100%',
              minHeight: 420,
              border: '1px solid #e4e7eb',
              borderRadius: 6,
              padding: 12,
              fontSize: 14,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              resize: 'vertical',
              lineHeight: 1.6,
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
      />
    </div>
  )
}
