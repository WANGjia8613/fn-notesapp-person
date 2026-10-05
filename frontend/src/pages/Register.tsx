import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

export default function Register({ onSuccess }: { onSuccess: (token: string, user: User) => void }) {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteInfo, setInviteInfo] = useState<{ email: string; workspaceName: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('缺少邀请码，请向管理员获取邀请链接')
      return
    }
    authApi
      .verifyInvitation(token)
      .then(setInviteInfo)
      .catch((e) => setError(e.message))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token: jwt, user } = await authApi.register(token, name, password)
      onSuccess(jwt, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
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
      <h2 style={{ marginBottom: 16 }}>邀请注册</h2>
      {inviteInfo && (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 6,
            padding: 10,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          你被邀请加入 <strong>{inviteInfo.workspaceName}</strong>
          <br />
          注册邮箱：<strong>{inviteInfo.email}</strong>
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        <input
          type="password"
          placeholder="密码（至少8位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        {error && <div style={{ color: '#dc2626', fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading || !inviteInfo} style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}>
          {loading ? '注册中...' : '注册并登录'}
        </button>
      </form>
      <div style={{ marginTop: 16, fontSize: 14, color: '#52606d' }}>
        已有账号？<Link to="/login">去登录</Link>
      </div>
    </div>
  )
}
