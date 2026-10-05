import { useEffect, useRef, useState } from 'react'
import { invitationApi, workspaceApi } from '../api'
import type { Invitation, User } from '../types'

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #d0d7de',
  borderRadius: 6,
  fontSize: 14,
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px',
  border: 'none',
  borderRadius: 6,
  background: '#2563eb',
  color: '#fff',
  fontSize: 14,
}

const btnGhost: React.CSSProperties = {
  padding: '5px 12px',
  border: '1px solid #d0d7de',
  borderRadius: 6,
  background: '#fff',
  fontSize: 13,
}

const roleMeta: Record<string, { bg: string; color: string; label: string }> = {
  owner: { bg: '#e0e7ff', color: '#3730a3', label: '超管 owner' },
  admin: { bg: '#dbeafe', color: '#1e40af', label: '管理员 admin' },
  member: { bg: '#f1f5f9', color: '#475569', label: '成员 member' },
}

const inviteStatusMeta: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e', label: '待使用' },
  used: { bg: '#dcfce7', color: '#166534', label: '已使用' },
  expired: { bg: '#f1f5f9', color: '#64748b', label: '已过期/已撤销' },
}

function Badge({ meta, fallback }: { meta?: { bg: string; color: string; label: string }; fallback: string }) {
  const m = meta || { bg: '#f1f5f9', color: '#475569', label: fallback }
  return (
    <span style={{ fontSize: 12, background: m.bg, color: m.color, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

/** 统一成 YYYY-MM-DD HH:mm（toLocaleString 在 zh-CN 下月/日不补零，列里会参差不齐） */
function fmt(dt: string): string {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 复制到剪贴板。
 * 注意：navigator.clipboard 只在安全上下文可用，局域网用 http://IP:8080 访问时不可用，
 * 因此保留 textarea + execCommand 的降级方案，并且界面上始终提供可选中的输入框。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 降级 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function Team({ user }: { user: User }) {
  const isAdmin = ['owner', 'admin'].includes(user.role)

  const [members, setMembers] = useState<User[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [email, setEmail] = useState('')
  const [days, setDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState<Invitation | null>(null)
  const freshInputRef = useRef<HTMLInputElement>(null)

  const buildLink = (inv: Invitation) =>
    inv.inviteLink || `${window.location.origin}/register?token=${inv.token}`

  const load = async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [ms, invs] = await Promise.all([workspaceApi.members(), invitationApi.list()])
      setMembers(ms)
      setInvitations(invs)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isAdmin])

  const create = async () => {
    const mail = email.trim()
    if (!mail) {
      setError('请填写被邀请人的邮箱')
      return
    }
    setCreating(true)
    setError('')
    setNotice('')
    try {
      const inv = await invitationApi.create(mail, days)
      setFresh(inv)
      setEmail('')
      await load()
      setTimeout(() => freshInputRef.current?.select(), 50)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成邀请失败')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (inv: Invitation) => {
    if (!confirm(`确定撤销发给 ${inv.email} 的邀请？撤销后该链接立即失效。`)) return
    try {
      await invitationApi.revoke(inv.id)
      setNotice('邀请已撤销')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败')
    }
  }

  const doCopy = async (text: string) => {
    const ok = await copyText(text)
    setNotice(ok ? '邀请链接已复制，发给对方即可' : '复制失败，请手动选中链接复制')
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={cardStyle}>
          <strong style={{ fontSize: 15 }}>无权访问</strong>
          <p style={{ color: '#52606d', fontSize: 14, marginTop: 8 }}>
            只有 owner（超管）或 admin（管理员）可以管理团队邀请。当前角色：{user.role}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>团队与邀请</h2>

      {error && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 14 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', marginBottom: 12, fontSize: 14 }}>{notice}</div>}

      {/* ---------- 生成邀请 ---------- */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>邀请新成员</strong>
        <p style={{ color: '#52606d', fontSize: 13, margin: '6px 0 12px' }}>
          本系统不开放公开注册。填好邮箱生成邀请链接，把链接发给对方，对方打开后设置密码即可加入（密码至少 8 位）。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="email"
            placeholder="被邀请人邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
            }}
            style={{ ...inputStyle, flex: '1 1 240px', minWidth: 220 }}
          />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
            <option value={1}>有效期 1 天</option>
            <option value={3}>有效期 3 天</option>
            <option value={7}>有效期 7 天</option>
            <option value={30}>有效期 30 天</option>
          </select>
          <button onClick={create} disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.6 : 1 }}>
            {creating ? '生成中...' : '生成邀请链接'}
          </button>
        </div>

        {fresh && (
          <div
            style={{
              marginTop: 14,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 13, color: '#1e40af', marginBottom: 6 }}>
              ✅ 已为 <strong>{fresh.email}</strong> 生成邀请（{fmt(fresh.expiresAt)} 前有效）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={freshInputRef}
                readOnly
                value={buildLink(fresh)}
                onFocus={(e) => e.currentTarget.select()}
                style={{ ...inputStyle, flex: '1 1 320px', minWidth: 240, background: '#fff', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
              />
              <button onClick={() => doCopy(buildLink(fresh))} style={btnGhost}>
                复制链接
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 邀请记录 ---------- */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>邀请记录</strong>
        {loading ? (
          <div style={{ color: '#52606d', fontSize: 14, marginTop: 12 }}>加载中...</div>
        ) : invitations.length === 0 ? (
          <div style={{ color: '#9aa5b1', fontSize: 14, marginTop: 12 }}>还没有发出过邀请</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: '#52606d', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>邮箱</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>状态</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>有效期至</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const expired = inv.status === 'pending' && new Date(inv.expiresAt) < new Date()
                  const effective = expired ? 'expired' : inv.status
                  return (
                    <tr key={inv.id}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{inv.email || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <Badge meta={inviteStatusMeta[effective]} fallback={effective} />
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#52606d', whiteSpace: 'nowrap' }}>
                        {fmt(inv.expiresAt)}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        {effective === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => doCopy(buildLink(inv))} style={btnGhost}>
                              复制链接
                            </button>
                            <button onClick={() => revoke(inv)} style={{ ...btnGhost, color: '#dc2626', borderColor: '#fecaca' }}>
                              撤销
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#9aa5b1', fontSize: 13 }}>-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- 成员列表 ---------- */}
      <div style={cardStyle}>
        <strong style={{ fontSize: 15 }}>团队成员（{members.length}）</strong>
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: '#52606d', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>姓名</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>邮箱</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>角色</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #e4e7eb' }}>加入时间</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                    {m.name}
                    {m.id === user.id && <span style={{ color: '#9aa5b1', fontSize: 12 }}>（我）</span>}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#52606d' }}>{m.email}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                    <Badge meta={roleMeta[m.role]} fallback={m.role} />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#52606d', whiteSpace: 'nowrap' }}>
                    {m.createdAt ? fmt(m.createdAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#9aa5b1', fontSize: 12, marginTop: 10 }}>
          当前版本不支持在界面上修改成员角色；需要提升为 admin 可直接改数据库 users.role 字段。
        </p>
      </div>
    </div>
  )
}
