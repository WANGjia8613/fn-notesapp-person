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
  /** 共享成员（仅私有笔记有效） */
  memberIds: string[]
  setMemberIds: (v: string[]) => void
  /** 团队内可选成员（已排除自己） */
  candidates: Member[]
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #d0d7de',
  borderRadius: 4,
  fontSize: 13,
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
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: '#fff',
        border: '1px solid #e4e7eb',
        borderRadius: 8,
        padding: 16,
        alignSelf: 'flex-start',
      }}
    >
      <h3 style={{ fontSize: 14, marginBottom: 12, color: '#37474f' }}>笔记属性</h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#52606d', display: 'block', marginBottom: 4 }}>到期时间</label>
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={fieldStyle} />
        <div style={{ fontSize: 12, color: '#9aa5b1', marginTop: 4 }}>提醒引擎会据此自动发邮件</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#52606d', display: 'block', marginBottom: 4 }}>提醒时间</label>
        <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} style={fieldStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#52606d', display: 'block', marginBottom: 4 }}>标签</label>
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
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button
            onClick={addTag}
            style={{ padding: '0 10px', border: '1px solid #d0d7de', borderRadius: 4, background: '#f8fafc', fontSize: 13 }}
          >
            添加
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12,
                background: '#f1f5f9',
                color: '#475569',
                padding: '2px 8px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              #{t}
              <button
                onClick={() => setTags(tags.filter((x) => x !== t))}
                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: '#52606d', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          设为私有笔记
        </label>
        <div style={{ fontSize: 12, color: '#9aa5b1', marginTop: 4, marginLeft: 24 }}>
          仅自己与下方选中的成员可见（owner 除外）
        </div>
      </div>

      {isPrivate && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 12,
            borderTop: '1px dashed #e4e7eb',
          }}
        >
          <label style={{ fontSize: 13, color: '#52606d', display: 'block', marginBottom: 6 }}>
            共享给（{memberIds.length}）
          </label>
          {candidates.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9aa5b1' }}>团队里还没有其他成员</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map((m) => (
                <label
                  key={m.id}
                  style={{ fontSize: 13, color: '#37474f', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(m.id)}
                    onChange={() => toggleMember(m.id)}
                  />
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
