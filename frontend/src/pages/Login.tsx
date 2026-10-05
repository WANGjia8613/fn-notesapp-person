import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api'
import type { User } from '../types'

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d0d7de',
  borderRadius: 6,
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  padding: '10px',
  border: 'none',
  borderRadius: 6,
  background: '#2563eb',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
}

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
    <div
      style={{
        maxWidth: 400,
        margin: '80px auto',
        padding: 24,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e4e7eb',
      }}
    >
      <h2 style={{ marginBottom: 20 }}>登录</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        {error && <div style={{ color: '#dc2626', fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
      <div style={{ marginTop: 16, fontSize: 14, color: '#52606d' }}>
        还没有账号？<Link to="/register">使用邀请码注册</Link>
      </div>
    </div>
  )
}
