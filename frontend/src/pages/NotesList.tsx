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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 20 }}>笔记列表</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 搜索标题/正文/标签"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, width: 200 }}
          />
          <label style={{ fontSize: 14, color: '#52606d', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
            仅看有到期时间
          </label>
          <Link
            to="/new"
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 6, fontSize: 14 }}
          >
            新建笔记
          </Link>
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#52606d' }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9aa5b1' }}>
          还没有笔记，点击右上角「新建笔记」开始
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {notes.map((note) => (
            <Link
              key={note.id}
              to={`/notes/${note.id}`}
              style={{
                background: '#fff',
                border: '1px solid #e4e7eb',
                borderRadius: 8,
                padding: 14,
                display: 'block',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {note.title || '无标题'}
              </div>
              <div style={{ fontSize: 12, color: '#9aa5b1', marginBottom: 8 }}>
                {note.author?.name} · {new Date(note.updatedAt).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {note.dueAt && (
                  <span style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4 }}>
                    到期：{new Date(note.dueAt).toLocaleDateString()}
                  </span>
                )}
                {note.isPrivate && (
                  <span style={{ fontSize: 12, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 4 }}>
                    私有
                  </span>
                )}
                {note.tags.slice(0, 3).map((t) => (
                  <span key={t} style={{ fontSize: 12, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4 }}>
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
