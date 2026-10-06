import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { notesApi } from '../api'
import type { Note } from '../types'
import { staggerContainer, staggerItem, easeOutSoft } from '../motion'

// 光标跟随高光：把鼠标相对卡片的坐标写进 CSS 变量，驱动 .spotlight::before 柔光
function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return { ref, onMouseMove: onMove }
}

function NoteCard({ note }: { note: Note }) {
  const spot = useSpotlight<HTMLAnchorElement>()
  return (
    <motion.div variants={staggerItem} layout style={{ position: 'relative' }}>
      <Link
        ref={spot.ref}
        onMouseMove={spot.onMouseMove}
        to={`/notes/${note.id}`}
        className="glass-card spotlight"
        style={{ padding: 18, display: 'block', color: 'inherit', height: '100%' }}
      >
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {note.title || '无标题'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {note.author?.name} · {new Date(note.updatedAt).toLocaleDateString()}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {note.dueAt && <span className="tag tag-due">⏰ {new Date(note.dueAt).toLocaleDateString()}</span>}
          {note.isPrivate && <span className="tag">🔒 私有</span>}
          {note.tags.slice(0, 3).map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      </Link>
    </motion.div>
  )
}

// 骨架卡片：加载态占位，避免布局跳动
function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-card" style={{ padding: 18, height: 116 }}>
          <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="skeleton" style={{ height: 20, width: 56, borderRadius: 20 }} />
            <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 20 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [search, setSearch] = useState('')
  const firstLoad = useRef(true)

  const load = async () => {
    // 首次加载显示骨架屏；后续筛选/搜索用轻量 loading，不整页闪烁
    if (firstLoad.current) setLoading(true)
    try {
      const list = await notesApi.list({ onlyDue, q: search })
      setNotes(list)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
      firstLoad.current = false
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 260 : 0) // 搜索防抖
    return () => clearTimeout(t)
  }, [onlyDue, search])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* 顶部标题 + 操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>笔记列表</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            <AnimatePresence mode="wait">
              <motion.span
                key={notes.length + '-' + loading}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'inline-block' }}
              >
                {loading ? '加载中…' : `共 ${notes.length} 篇笔记`}
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
            <input
              type="text"
              placeholder="搜索标题/正文/标签"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-glass"
              style={{ paddingLeft: 36, width: 240 }}
            />
          </div>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.5)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            仅看到期
          </label>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link to="/new" className="btn-primary">+ 新建笔记</Link>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ color: '#dc2626', marginBottom: 12, background: 'rgba(220,38,38,0.08)', padding: 12, borderRadius: 8, overflow: 'hidden' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <SkeletonCards />
      ) : notes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: easeOutSoft }}
          className="glass-card"
          style={{ textAlign: 'center', padding: '60px 20px' }}
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: 48, marginBottom: 16 }}
          >
            📝
          </motion.div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {search || onlyDue ? '没有匹配的笔记' : '还没有笔记'}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {search || onlyDue ? '换个关键词或取消「仅看到期」试试' : '点击右上角「新建笔记」开始记录你的想法'}
          </p>
          {!search && !onlyDue && (
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={{ display: 'inline-block' }}>
              <Link to="/new" className="btn-primary">创建第一篇笔记</Link>
            </motion.div>
          )}
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}
        >
          <AnimatePresence mode="popLayout">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  )
}
