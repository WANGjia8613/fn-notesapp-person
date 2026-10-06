import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { notesApi, workspaceApi, authApi } from '../api'
import NoteSidebar from '../components/NoteSidebar'
import MarkdownBody from '../components/MarkdownBody'
import RichTextBody from '../components/RichTextBody'
import { useImageUpload } from '../components/editor/useImageUpload'
import { useToast } from '../components/Toast'
import { easeOutSoft } from '../motion'

export default function NoteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const isNew = !id

  const [title, setTitle] = useState('')
  // 正文按格式分派两条互斥路径：markdown -> MarkdownBody；html -> RichTextBody
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
  const [loaded, setLoaded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toast = useToast()
  const { flushPending } = useImageUpload(id)
  const lastSaved = useRef<string>('') // 自动保存去重：内容快照

  // 团队成员列表（私有笔记共享选择，排除自己）
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
          lastSaved.current = snapshot({ ...note, members: (note.members ?? []).map((m) => ({ userId: m.userId })) })
        })
        .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoaded(true))
    } else {
      // 新建默认富文本，可用 /new?format=markdown 走 Markdown
      setBodyFormat(sp.get('format') === 'markdown' ? 'markdown' : 'html')
      setLoaded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const snapshot = (n: Record<string, any>) =>
    JSON.stringify({ t: n.title, f: n.bodyFormat, md: n.bodyMd, j: n.bodyJson, h: n.bodyHtml, tags: n.tags, due: n.dueAt, rem: n.remindAt, p: n.isPrivate, m: n.members })

  const buildPayload = () => ({
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
  })

  const save = async (silent = false): Promise<boolean> => {
    if (!title.trim()) {
      if (!silent) setError('标题不能为空')
      else toast.error('标题不能为空，未保存')
      return false
    }
    setSaving(true)
    setError('')
    try {
      const payload = buildPayload()
      const saved = isNew ? await notesApi.create(payload) : await notesApi.update(id!, payload)
      if (isNew) {
        await flushPending(saved.id)
        navigate(`/notes/${saved.id}`, { replace: true })
        if (!silent) toast.success('笔记已创建')
      } else {
        lastSaved.current = snapshot({ ...saved, members: (saved.members ?? []).map((m) => ({ userId: m.userId })) })
        if (!silent) toast.success('已保存 ✓')
      }
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败'
      setError(msg)
      toast.error(msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  // 自动保存（仅编辑已有笔记）：内容变化后静默保存，防抖 2s
  useEffect(() => {
    if (isNew || !loaded) return
    const snap = snapshot({ title, bodyFormat, bodyMd, bodyJson, bodyHtml, tags, dueAt: dueAt ? new Date(dueAt).toISOString() : null, remindAt: remindAt ? new Date(remindAt).toISOString() : null, isPrivate, members: memberIds.map((userId) => ({ userId })) })
    if (snap === lastSaved.current) return
    if (!title.trim()) return // 标题空不自动保存，避免误建
    const t = setTimeout(() => {
      save(true)
    }, 2000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyMd, bodyJson, bodyHtml, tags, dueAt, remindAt, isPrivate, memberIds])

  // Ctrl/Cmd+S 手动保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyMd, bodyJson, bodyHtml, tags, dueAt, remindAt, isPrivate, memberIds, isNew, id])

  const remove = async () => {
    if (!id) return
    try {
      await notesApi.remove(id)
      toast.success('笔记已删除')
      navigate('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className="editor-layout">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutSoft }}
        className="glass-card"
        style={{ flex: 1, minWidth: 340, padding: 24 }}
      >
        {/* 元信息行 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag" title="正文格式" style={{ opacity: 0.85 }}>
            {bodyFormat === 'html' ? '富文本' : 'Markdown'}
          </span>
          {!isNew && (
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>· 编辑时自动保存</span>
          )}
          <div style={{ flex: 1 }} />
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => save(false)} disabled={saving} className="btn-primary btn-sm">
            {saving ? '保存中…' : '💾 保存'}
          </motion.button>
          {!isNew && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmDelete(true)} className="btn-danger btn-sm">
              🗑️ 删除
            </motion.button>
          )}
        </div>

        {/* 标题输入 */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题"
          autoFocus={isNew}
          style={{ width: '100%', fontSize: 24, fontWeight: 700, border: 'none', outline: 'none', marginBottom: 16, padding: '6px 0', background: 'transparent', color: 'var(--text)', letterSpacing: '-0.02em' }}
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ color: '#dc2626', marginBottom: 12, fontSize: 13, background: 'rgba(220,38,38,0.08)', padding: '10px 14px', borderRadius: 8, overflow: 'hidden' }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 正文区：数据到位前不挂编辑器，避免 TipTap 空内容闪烁 */}
        {!loaded ? (
          <div style={{ minHeight: 440, padding: '20px 0' }}>
            <div className="skeleton" style={{ height: 22, width: '50%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 14, width: '95%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '88%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '92%' }} />
          </div>
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
      </motion.div>

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

      {/* 删除确认弹窗（替代原生 confirm，桌面质感） */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDelete(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: 20 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="glass"
              style={{ width: '100%', maxWidth: 380, padding: '28px 26px', borderRadius: 'var(--radius-xl)', textAlign: 'center' }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>删除这篇笔记？</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 22, lineHeight: 1.6 }}>此操作不可撤销，笔记及其附件将从服务器移除。</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>取消</button>
                <button className="btn-danger" style={{ flex: 1, padding: '9px 16px' }} onClick={remove}>确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
