import { useEffect, useRef, useState } from 'react'
import { invitationApi, workspaceApi } from '../api'
import type { Invitation, User } from '../types'

const roleMeta: Record<string, { bg: string; color: string; label: string }> = {
  owner: { bg: 'rgba(99,102,241,0.12)', color: '#4f46e5', label: '超管 owner' },
  admin: { bg: 'rgba(59,130,246,0.12)', color: '#2563eb', label: '管理员 admin' },
  member: { bg: 'rgba(0,0,0,0.05)', color: '#64748b', label: '成员 member' },
}

const inviteStatusMeta: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#d97706', label: '待使用' },
  used: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a', label: '已使用' },
  expired: { bg: 'rgba(0,0,0,0.05)', color: '#64748b', label: '已过期/已撤销' },
}

function Badge({ meta, fallback }: { meta?: { bg: string; color: string; label: string }; fallback: string }) {
  const m = meta || { bg: 'rgba(0,0,0,0.05)', color: '#64748b', label: fallback }
  return (
    <span
      style={{
        fontSize: 12,
        background: m.bg,
        color: m.color,
        padding: '3px 10px',
        borderRadius: 20,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  )
}

function fmt(dt: string): string {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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

  const buildLink = (inv: Invitation) => inv.inviteLink || `${window.location.origin}/register?token=${inv.token}`

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
      <div style={{ maxWidth: 900, margin: '0 auto' }} className="animate-in">
        <div className="glass-card" style={{ padding: 24 }}>
          <strong style={{ fontSize: 16, fontWeight: 700 }}>🔒 无权访问</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
            只有 owner（超管）或 admin（管理员）可以管理团队邀请。当前角色：{user.role}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }} className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>👥 团队与邀请</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>管理团队成员和邀请链接</p>
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13, background: 'rgba(220,38,38,0.08)', padding: '10px 14px', borderRadius: 8 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ color: '#16a34a', marginBottom: 12, fontSize: 13, background: 'rgba(34,197,94,0.08)', padding: '10px 14px', borderRadius: 8 }}>
          {notice}
        </div>
      )}

      {/* 生成邀请 */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>✉️ 邀请新成员</strong>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 14px' }}>
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
            className="input-glass"
            style={{ flex: '1 1 240px', minWidth: 220, fontSize: 13, padding: '9px 12px' }}
          />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-glass" style={{ fontSize: 13, padding: '9px 12px', width: 130 }}>
            <option value={1}>有效期 1 天</option>
            <option value={3}>有效期 3 天</option>
            <option value={7}>有效期 7 天</option>
            <option value={30}>有效期 30 天</option>
          </select>
          <button onClick={create} disabled={creating} className="btn-primary" style={{ opacity: creating ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {creating ? '生成中...' : '生成邀请链接'}
          </button>
        </div>

        {fresh && (
          <div
            style={{
              marginTop: 14,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--primary-dark)', marginBottom: 8, fontWeight: 500 }}>
              ✅ 已为 <strong>{fresh.email}</strong> 生成邀请（{fmt(fresh.expiresAt)} 前有效）
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={freshInputRef}
                readOnly
                value={buildLink(fresh)}
                onFocus={(e) => e.currentTarget.select()}
                className="input-glass"
                style={{ flex: '1 1 320px', minWidth: 240, fontFamily: "'SF Mono', monospace", fontSize: 12, padding: '9px 12px' }}
              />
              <button onClick={() => doCopy(buildLink(fresh))} className="btn-secondary btn-sm">
                复制链接
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 邀请记录 */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>📋 邀请记录</strong>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 14 }}>加载中...</div>
        ) : invitations.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 14, textAlign: 'center', padding: '16px 0' }}>还没有发出过邀请</div>
        ) : (
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table className="table-glass">
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>状态</th>
                  <th>有效期至</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const expired = inv.status === 'pending' && new Date(inv.expiresAt) < new Date()
                  const effective = expired ? 'expired' : inv.status
                  return (
                    <tr key={inv.id}>
                      <td>{inv.email || '-'}</td>
                      <td>
                        <Badge meta={inviteStatusMeta[effective]} fallback={effective} />
                      </td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmt(inv.expiresAt)}</td>
                      <td>
                        {effective === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => doCopy(buildLink(inv))} className="btn-secondary btn-sm">
                              复制链接
                            </button>
                            <button onClick={() => revoke(inv)} className="btn-danger btn-sm">
                              撤销
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>-</span>
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

      {/* 成员列表 */}
      <div className="glass-card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          👤 团队成员（{members.length}）
        </strong>
        <div style={{ marginTop: 14, overflowX: 'auto' }}>
          <table className="table-glass">
            <thead>
              <tr>
                <th>姓名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>加入时间</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {m.name?.charAt(0) || 'U'}
                      </div>
                      <span>
                        {m.name}
                        {m.id === user.id && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>（我）</span>}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                  <td>
                    <Badge meta={roleMeta[m.role]} fallback={m.role} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.createdAt ? fmt(m.createdAt) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
          当前版本不支持在界面上修改成员角色；需要提升为 admin 可直接改数据库 users.role 字段。
        </p>
      </div>
    </div>
  )
}
