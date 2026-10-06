import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authApi } from '../api'
import type { User } from '../types'
import { useToast } from '../components/Toast'
import { easeOutSoft } from '../motion'

export default function Register({ onSuccess }: { onSuccess: (token: string, user: User) => void }) {
  const [params] = useSearchParams()
  const tokenFromUrl = params.get('token') || ''
  const [token, setToken] = useState(tokenFromUrl)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const toast = useToast()

  // 校验邀请码（URL 带入或手动粘贴均可）
  useEffect(() => {
    if (!token) {
      setInviteInfo(null)
      return
    }
    setVerifying(true)
    authApi
      .verifyInvitation(token)
      .then(setInviteInfo)
      .catch((e) => {
        setInviteInfo(null)
        setError(e instanceof Error ? e.message : '邀请码无效')
      })
      .finally(() => setVerifying(false))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token: jwt, user } = await authApi.register(token, name, password)
      toast.success(`欢迎加入，${user.name}`)
      onSuccess(jwt, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  // 从粘贴的完整邀请链接里提取 token，方便用户直接粘链接
  const handleTokenInput = (v: string) => {
    const m = v.match(/[?&]token=([^&]+)/)
    setToken(m ? decodeURIComponent(m[1]) : v.trim())
  }

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: easeOutSoft }}
        className="glass"
        style={{ width: '100%', maxWidth: 440, padding: '36px 32px', borderRadius: 'var(--radius-xl)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: 12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
            style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 14, boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
          >
            📝
          </motion.div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>邀请注册</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>加入团队，开始协作</p>
        </div>

        <AnimatePresence mode="wait">
          {verifying ? (
            <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 12, padding: '14px 16px', marginBottom: 18, fontSize: 13.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}>⟳</motion.span>
              正在校验邀请码…
            </motion.div>
          ) : inviteInfo ? (
            <motion.div
              key="ok"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 18, fontSize: 14 }}
            >
              <div style={{ marginBottom: 4 }}>🎉 你被邀请加入 <strong style={{ color: 'var(--primary-dark)' }}>{inviteInfo.workspaceName}</strong></div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>注册邮箱：<strong style={{ color: 'var(--text)' }}>{inviteInfo.email}</strong></div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>邀请码</label>
            <input
              placeholder="粘贴邀请码，或整条邀请链接"
              value={token}
              onChange={(e) => handleTokenInput(e.target.value)}
              className="input-glass"
              style={{ fontFamily: 'SF Mono, Consolas, monospace', fontSize: 13 }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>桌面版打不开网页邀请链接，把链接或其中的 token 粘进来即可</div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>姓名</label>
            <input placeholder="你的名字" value={name} onChange={(e) => setName(e.target.value)} required className="input-glass" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>密码</label>
            <input type="password" placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="input-glass" autoComplete="new-password" />
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ color: '#dc2626', fontSize: 13, background: 'rgba(220,38,38,0.08)', padding: '10px 12px', borderRadius: 8, overflow: 'hidden' }}>
              {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: loading || !inviteInfo ? 1 : 1.015 }}
            whileTap={{ scale: loading || !inviteInfo ? 1 : 0.98 }}
            type="submit"
            disabled={loading || !inviteInfo}
            className="btn-primary"
            style={{ marginTop: 4, opacity: loading || !inviteInfo ? 0.6 : 1 }}
          >
            {loading ? '注册中…' : '注册并登录'}
          </motion.button>
        </form>

        <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
          已有账号？<Link to="/login" style={{ fontWeight: 600 }}>去登录</Link>
        </div>
      </motion.div>
    </div>
  )
}
