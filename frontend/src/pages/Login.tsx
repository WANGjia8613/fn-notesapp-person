import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api'
import type { User } from '../types'

export default function Login({ onSuccess }: { onSuccess: (token: string, user: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await authApi.login(email, password)
      onSuccess(token, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div
        className="glass animate-in"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '36px 32px',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              marginBottom: 14,
              boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
            }}
          >
            📝
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>欢迎回来</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>登录你的笔记账号</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              邮箱
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-glass"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              密码
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-glass"
            />
          </div>
          {error && (
            <div
              style={{
                color: '#dc2626',
                fontSize: 13,
                background: 'rgba(220,38,38,0.08)',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 4, opacity: loading ? 0.6 : 1 }}>
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>
        <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
          还没有账号？<Link to="/register" style={{ fontWeight: 600 }}>使用邀请码注册</Link>
        </div>
      </div>
    </div>
  )
}
