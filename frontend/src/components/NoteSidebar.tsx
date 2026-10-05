import { useState } from 'react'

interface Member {
  id: string
  name: string
  email?: string
}

interface Props {
  tags: string[]
  setTags: (t: string[]) => void
  dueAt: string
  setDueAt: (v: string) => void
  remindAt: string
  setRemindAt: (v: string) => void
  isPrivate: boolean
  setIsPrivate: (v: boolean) => void
  memberIds: string[]
  setMemberIds: (v: string[]) => void
  candidates: Member[]
}

export default function NoteSidebar({
  tags,
  setTags,
  dueAt,
  setDueAt,
  remindAt,
  setRemindAt,
  isPrivate,
  setIsPrivate,
  memberIds,
  setMemberIds,
  candidates,
}: Props) {
  const [tagInput, setTagInput] = useState('')

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  const toggleMember = (id: string) => {
    setMemberIds(memberIds.includes(id) ? memberIds.filter((x) => x !== id) : [...memberIds, id])
  }

  return (
    <aside className="glass-card note-sidebar">
      <h3
        style={{
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 18,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        ⚙️ 笔记属性
      </h3>

      {/* 到期时间 */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          ⏰ 到期时间
        </label>
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input-glass" style={{ fontSize: 13, padding: '8px 10px' }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>提醒引擎会据此自动发邮件</div>
      </div>

      {/* 提醒时间 */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          🔔 提醒时间
        </label>
        <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="input-glass" style={{ fontSize: 13, padding: '8px 10px' }} />
      </div>

      {/* 标签 */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          🏷️ 标签
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="输入后回车"
            className="input-glass"
            style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
          />
          <button onClick={addTag} className="btn-secondary btn-sm" style={{ padding: '8px 12px' }}>
            添加
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {tags.map((t) => (
            <span
              key={t}
              className="tag"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                paddingRight: 6,
              }}
            >
              #{t}
              <button
                onClick={() => setTags(tags.filter((x) => x !== t))}
                style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 私有笔记 */}
      <div style={{ marginBottom: 4 }}>
        <label
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            padding: '10px 12px',
            background: isPrivate ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.03)',
            borderRadius: 10,
            border: isPrivate ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
            transition: 'all 0.2s ease',
          }}
        >
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          🔒 设为私有笔记
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginLeft: 8 }}>
          仅自己与下方选中的成员可见（owner 除外）
        </div>
      </div>

      {/* 共享成员 */}
      {isPrivate && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border-strong)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
            👥 共享给（{memberIds.length}）
          </label>
          {candidates.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>团队里还没有其他成员</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map((m) => (
                <label
                  key={m.id}
                  style={{
                    fontSize: 13,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: memberIds.includes(m.id) ? 'rgba(99,102,241,0.06)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} style={{ accentColor: 'var(--primary)' }} />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
