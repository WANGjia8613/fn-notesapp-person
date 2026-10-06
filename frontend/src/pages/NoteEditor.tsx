import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { notesApi, workspaceApi, authApi } from '../api'
import NoteSidebar from '../components/NoteSidebar'
import MarkdownBody from '../components/MarkdownBody'
import RichTextBody from '../components/RichTextBody'
import { useImageUpload } from '../components/editor/useImageUpload'

export default function NoteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [title, setTitle] = useState('')
  // 正文按格式分派两条互斥路径：
  //   markdown -> 存量笔记，走 MarkdownBody（react-markdown + Mermaid，原样保留）
  //   html     -> 新笔记，走 RichTextBody（TipTap 所见即所得）
  const [bodyFormat, setBodyFormat] = useState<'markdown' | 'html'>('markdown')
  const [bodyMd, setBodyMd] = useState('')
  const [bodyJson, setBodyJson] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dueAt, setDueAt] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [candidates, setCandidates] = useState<{ id: string; name: string; email?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 数据到位前不挂编辑器：否则 TipTap 会先用空内容初始化再被异步内容覆盖，
  // 出现一次闪烁 + 焦点跳动
  const [loaded, setLoaded] = useState(false)

  // 附件补绑：新建笔记时插入的图片，笔记创建成功后补挂到笔记上（修既有游离缺陷）
  const { flushPending } = useImageUpload(id)

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
          setBodyFormat(note.bodyFormat === 'html' ? 'html' : 'markdown')
          setBodyMd(note.bodyMd || '')
          setBodyJson(note.bodyJson || '')
          setBodyHtml(note.bodyHtml || '')
          setTags(note.tags)
          setDueAt(note.dueAt ? note.dueAt.slice(0, 16) : '')
          setRemindAt(note.remindAt ? note.remindAt.slice(0, 16) : '')
          setIsPrivate(note.isPrivate)
          setMemberIds((note.members ?? []).map((m) => m.userId))
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true))
    } else {
      // 新建笔记默认富文本。仍可用 /new?format=markdown 走 Markdown 路径。
      const sp = new URLSearchParams(window.location.search)
      setBodyFormat(sp.get('format') === 'markdown' ? 'markdown' : 'html')
      setLoaded(true)
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
      // 三段正文一起给，后端 normalizeBody 会按 bodyFormat 强制互斥，
      // 前端传错也不会污染数据（不依赖前端自律）
      const payload = {
        title,
        bodyFormat,
        bodyMd,
        bodyJson,
        bodyHtml,
        tags,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        remindAt: remindAt ? new Date(remindAt).toISOString() : null,
        isPrivate,
        memberIds: isPrivate ? memberIds : [],
      }
      const saved = isNew ? await notesApi.create(payload) : await notesApi.update(id!, payload)
      if (isNew) {
        // 修复既有缺陷：新建笔记时上传的附件（noteId 为空）在此补挂到笔记上
        await flushPending(saved.id)
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

  return (
    <div className="editor-layout animate-in">
      <div className="glass-card" style={{ flex: 1, minWidth: 340, padding: 24 }}>
        {/* 元信息行：格式角标 + 保存/删除。附件按钮与预览 tab 已移入 MarkdownBody*/}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag" title="正文格式：富文本笔记与 Markdown 笔记的编辑方式不同" style={{ opacity: 0.85 }}>
            {bodyFormat === 'html' ? '富文本' : 'Markdown'}
          </span>
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

        {/* 正文区：按 bodyFormat 分派两条互斥路径。
            富文本侧不给「预览」tab —— 所见即所得下预览是反模式；
            Markdown 侧必须保留，因为 Mermaid 图表只在预览态经 MermaidBlock 渲染。 */}
        {!loaded ? (
          <div style={{ minHeight: 440, color: 'var(--text-muted)', padding: '20px 0' }}>加载中...</div>
        ) : bodyFormat === 'html' ? (
          <RichTextBody
            key={id ?? 'new'}
            noteId={id}
            bodyJson={bodyJson}
            bodyHtml={bodyHtml}
            onChange={({ bodyJson: j, bodyHtml: h }) => {
              setBodyJson(j)
              setBodyHtml(h)
            }}
          />
        ) : (
          <MarkdownBody bodyMd={bodyMd} onChange={setBodyMd} noteId={id} onError={setError} />
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
