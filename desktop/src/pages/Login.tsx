import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authApi } from '../api'
import type { User } from '../types'
import { useToast } from '../components/Toast'
import { easeOutSoft } from '../motion'

interface Props {
  onSuccess: (token: string, user: User) => void
  onNeedNas?: () => void
}

export default function Login({ onSuccess, onNeedNas }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await authApi.login(email, password)
      toast.success(`欢迎回来，${user.name}`)
      onSuccess(token, user)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登录失败'
      // 桌面版：若是「未配置 NAS」类错误，引导去配置
      if (msg.includes('NAS') || msg.includes('尚未配置')) {
        setError(msg)
        onNeedNas?.()
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: easeOutSoft }}
        className="glass"
        style={{ width: '100%', maxWidth: 420, padding: '38px 32px', borderRadius: 'var(--radius-xl)' }}
      >
        {/* Logo：入场回弹 */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.12 }}
            style={{ width: 58, height: 58, borderRadius: 17, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 14, boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
          >
            📝
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4, ease: easeOutSoft }}
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}
          >
            欢迎回来
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{ fontSize: 14, color: 'var(--text-secondary)' }}
          >
            登录以继续你的笔记
          </motion.p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28, duration: 0.4, ease: easeOutSoft }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>邮箱</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-glass" autoComplete="username" />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.36, duration: 0.4, ease: easeOutSoft }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>密码</label>
            <input type="password" placeholder="你的密码" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-glass" autoComplete="current-password" />
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{ color: '#dc2626', fontSize: 13, background: 'rgba(220,38,38,0.08)', padding: '10px 12px', borderRadius: 8, overflow: 'hidden' }}
            >
              {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: loading ? 1 : 1.015 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ marginTop: 6, opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block' }}>⟳</motion.span>
                登录中…
              </>
            ) : (
              '登录'
            )}
          </motion.button>
        </form>

        {onNeedNas && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              onClick={onNeedNas}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              🗄️ 配置 / 修改 NAS 服务地址
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
          收到邀请链接？<Link to="/register" style={{ fontWeight: 600 }}>去注册</Link>
        </div>
      </motion.div>
    </div>
  )
}
