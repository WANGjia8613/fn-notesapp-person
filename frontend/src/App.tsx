import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { authApi, clearToken, setToken } from './api'
import type { User } from './types'
import Login from './pages/Login'
import Register from './pages/Register'
import NotesList from './pages/NotesList'
import NoteEditor from './pages/NoteEditor'
import ReminderSettings from './pages/ReminderSettings'
import Team from './pages/Team'

function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    authApi.me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return { user, setUser, loading, logout }
}

function Layout({ user, logout, children }: { user: User; logout: () => void; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-nav"
        style={{
          padding: '12px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 16,
              marginRight: 8,
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
            }}
          >
            📝
          </div>
          <strong style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginRight: 16 }}>
            笔记
          </strong>
          <Link to="/" className="nav-link">笔记列表</Link>
          <Link to="/new" className="nav-link">新建笔记</Link>
          <Link to="/settings" className="nav-link">提醒设置</Link>
          {['owner', 'admin'].includes(user.role) && (
            <Link to="/team" className="nav-link">团队与邀请</Link>
          )}
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(99,102,241,0.08)',
              padding: '5px 12px',
              borderRadius: 20,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {user.name?.charAt(0) || 'U'}
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
              {user.name}
            </span>
            <span
              style={{
                fontSize: 11,
                background: 'rgba(99,102,241,0.15)',
                color: '#4f46e5',
                padding: '1px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {user.role}
            </span>
          </div>
          <button onClick={logout} className="btn-secondary btn-sm">
            退出
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: '28px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>{children}</main>
    </div>
  )
}

export default function App() {
  const { user, setUser, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#52606d' }}>加载中...</div>
  }

  const handleAuthSuccess = (token: string, u: User) => {
    setToken(token)
    setUser(u)
    navigate('/')
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login onSuccess={handleAuthSuccess} />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register onSuccess={handleAuthSuccess} />} />
      <Route
        path="/"
        element={
          user ? (
            <Layout user={user} logout={logout}>
              <NotesList />
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/new"
        element={
          user ? (
            <Layout user={user} logout={logout}>
              <NoteEditor />
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/notes/:id"
        element={
          user ? (
            <Layout user={user} logout={logout}>
              <NoteEditor />
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/settings"
        element={
          user ? (
            <Layout user={user} logout={logout}>
              <ReminderSettings />
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="/team"
        element={
          user ? (
            <Layout user={user} logout={logout}>
              <Team user={user} />
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
