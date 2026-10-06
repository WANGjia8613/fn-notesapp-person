import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { invitationApi, workspaceApi } from '../api'
import type { Invitation, User } from '../types'
import { useToast } from '../components/Toast'
import { staggerContainer, staggerItem } from '../motion'

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }

function statusTag(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '待使用', cls: 'tag-due' },
    used: { label: '已使用', cls: '' },
    expired: { label: '已过期', cls: '' },
    revoked: { label: '已撤销', cls: '' },
  }
  const m = map[s] || { label: s, cls: '' }
  return <span className={'tag ' + m.cls}>{m.label}</span>
}

export default function Team({ user }: { user: User }) {
  const toast = useToast()
  const [members, setMembers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [noAccess, setNoAccess] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([workspaceApi.members(), invitationApi.list()])
      .then(([m, i]) => { setMembers(m); setInvites(i); setNoAccess(false) })
      .catch((e) => {
        // 普通成员访问会被后端拒绝
        if (e instanceof Error && (e.message.includes('无权') || e.message.includes('403'))) setNoAccess(true)
        else toast.error(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const isAdmin = ['owner', 'admin'].includes(user.role)

  const create = async () => {
    if (!email.trim()) { toast.error('请填写邮箱'); return }
    setCreating(true)
    try {
      const inv = await invitationApi.create(email, days)
      toast.success('邀请已生成')
      setEmail('')
      load()
      // 桌面版：自动把邀请链接复制到剪贴板，方便直接发给对方
      const link = inv.inviteLink
      if (link) {
        try {
          await navigator.clipboard.writeText(link)
          toast.info('邀请链接已复制到剪贴板')
        } catch { /* 忽略 */ }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    try { await invitationApi.revoke(id); toast.success('已撤销'); load() } catch (e) { toast.error((e as Error).message) }
  }

  const copyLink = async (inv: Invitation) => {
    if (!inv.inviteLink) { toast.error('该邀请无可用链接'); return }
    try {
      await navigator.clipboard.writeText(inv.inviteLink)
      toast.success('链接已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  if (noAccess) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>无权访问</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>只有团队 owner / admin 可以管理成员与邀请</p>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>团队与邀请</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>生成邀请链接、管理成员，邀请制注册默认不开放公开注册</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 24, height: 120 }}><div className="skeleton" style={{ height: 40, marginBottom: 12 }} /><div className="skeleton" style={{ height: 40 }} /></div>
          <div className="glass-card" style={{ padding: 24, height: 160 }}><div className="skeleton" style={{ height: 20, width: '30%', marginBottom: 16 }} /><div className="skeleton" style={{ height: 40, marginBottom: 8 }} /><div className="skeleton" style={{ height: 40 }} /></div>
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 生成邀请 */}
          {isAdmin && (
            <motion.div variants={staggerItem} className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>生成邀请链接</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>填被邀请人邮箱 + 选有效期，生成后复制链接发给对方（对方在浏览器打开注册）</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={fieldLabel}>被邀请人邮箱</label>
                  <input type="email" placeholder="someone@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass" />
                </div>
                <div>
                  <label style={fieldLabel}>有效期</label>
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-glass" style={{ width: 120 }}>
                    <option value={1}>1 天</option>
                    <option value={3}>3 天</option>
                    <option value={7}>7 天</option>
                    <option value={30}>30 天</option>
                  </select>
                </div>
                <button onClick={create} disabled={creating} className="btn-primary" style={{ opacity: creating ? 0.7 : 1 }}>{creating ? '生成中…' : '生成邀请链接'}</button>
              </div>
            </motion.div>
          )}

          {/* 邀请记录 */}
          <motion.div variants={staggerItem} className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>邀请记录（{invites.length}）</h3>
            {invites.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>暂无邀请</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invites.map((inv) => (
                  <motion.div
                    key={inv.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.5)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 500, minWidth: 160 }}>{inv.email || '（未指定邮箱）'}</span>
                    {statusTag(inv.status)}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>到期 {new Date(inv.expiresAt).toLocaleString()}</span>
                    <div style={{ flex: 1 }} />
                    {inv.status === 'pending' && (
                      <>
                        <button onClick={() => copyLink(inv)} className="btn-secondary btn-sm">复制链接</button>
                        <button onClick={() => revoke(inv.id)} className="btn-danger btn-sm">撤销</button>
                      </>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* 成员列表 */}
          <motion.div variants={staggerItem} className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>团队成员（{members.length}）</h3>
            <table className="table-glass">
              <thead><tr><th>姓名</th><th>邮箱</th><th>角色</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{m.name?.charAt(0) || '?'}</span>
                      {m.name}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                    <td><span className="tag">{m.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
