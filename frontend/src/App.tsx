import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { authApi, clearToken, setToken } from './api'
import type { User } from './types'
import Login from './pages/Login'
import Register from './pages/Register'
import NotesList from './pages/NotesList'
import NoteEditor from './pages/NoteEditor'
import ReminderSettings from './pages/ReminderSettings'

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
        style={{
          background: '#fff',
          borderBottom: '1px solid #e4e7eb',
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <strong style={{ fontSize: 16 }}>📝 笔记</strong>
          <Link to="/" style={{ color: '#52606d' }}>笔记列表</Link>
          <Link to="/new" style={{ color: '#52606d' }}>新建笔记</Link>
          <Link to="/settings" style={{ color: '#52606d' }}>提醒设置</Link>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <span style={{ color: '#52606d' }}>
            {user.name}（{user.role}）
          </span>
          <button
            onClick={logout}
            style={{ padding: '4px 12px', border: '1px solid #d0d7de', borderRadius: 6, background: '#fff' }}
          >
            退出
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: 20 }}>{children}</main>
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
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
