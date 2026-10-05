import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import type { User } from '../types'

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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
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
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>邀请注册</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>加入团队，开始协作</p>
        </div>

        {inviteInfo && (
          <div
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 18,
              fontSize: 14,
            }}
          >
            <div style={{ marginBottom: 4 }}>
              🎉 你被邀请加入 <strong style={{ color: 'var(--primary-dark)' }}>{inviteInfo.workspaceName}</strong>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              注册邮箱：<strong style={{ color: 'var(--text)' }}>{inviteInfo.email}</strong>
            </div>
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              姓名
            </label>
            <input placeholder="你的名字" value={name} onChange={(e) => setName(e.target.value)} required className="input-glass" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              密码
            </label>
            <input
              type="password"
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="input-glass"
            />
          </div>
          {error && (
            <div
              style={{
                color: '#dc2626',
                fontSize: 13,
                background: 'rgba(220,38,38,0.08)',
                padding: '10px 12px',
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !inviteInfo}
            className="btn-primary"
            style={{ marginTop: 4, opacity: loading || !inviteInfo ? 0.6 : 1 }}
          >
            {loading ? '注册中...' : '注册并登录'}
          </button>
        </form>
        <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
          已有账号？<Link to="/login" style={{ fontWeight: 600 }}>去登录</Link>
        </div>
      </div>
    </div>
  )
}
