import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { notesApi } from '../api'
import type { Note } from '../types'

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const list = await notesApi.list({ onlyDue, q: search })
      setNotes(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [onlyDue, search])

  return (
    <div className="animate-in">
      {/* 顶部标题 + 操作栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>笔记列表</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>共 {notes.length} 篇笔记</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="搜索标题/正文/标签"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-glass"
              style={{ paddingLeft: 36, width: 240 }}
            />
          </div>
          <label
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.5)',
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            仅看到期
          </label>
          <Link to="/new" className="btn-primary">
            + 新建笔记
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, background: 'rgba(220,38,38,0.08)', padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 60 }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div
          className="glass-card"
          style={{ textAlign: 'center', padding: '60px 20px' }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>还没有笔记</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            点击右上角「新建笔记」开始记录你的想法
          </p>
          <Link to="/new" className="btn-primary">
            创建第一篇笔记
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {notes.map((note, idx) => (
            <Link
              key={note.id}
              to={`/notes/${note.id}`}
              className="glass-card"
              style={{
                padding: 18,
                display: 'block',
                color: 'inherit',
                animationDelay: `${idx * 0.05}s`,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  marginBottom: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                }}
              >
                {note.title || '无标题'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {note.author?.name} · {new Date(note.updatedAt).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {note.dueAt && (
                  <span className="tag tag-due">⏰ {new Date(note.dueAt).toLocaleDateString()}</span>
                )}
                {note.isPrivate && <span className="tag">🔒 私有</span>}
                {note.tags.slice(0, 3).map((t) => (
                  <span key={t} className="tag">
                    #{t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
