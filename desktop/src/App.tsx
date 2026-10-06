import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { authApi, clearToken, setToken } from './api'
import type { User } from './types'
import { pageVariants } from './motion'
import Titlebar from './components/Titlebar'
import { ToastProvider } from './components/Toast'
import NasConfig from './components/NasConfig'
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
    authApi
      .me()
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

function Layout({ user, logout, children, onOpenNas }: { user: User; logout: () => void; children: React.ReactNode; onOpenNas: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Titlebar />
      <header
        className="glass-nav"
        style={{ padding: '12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 'var(--titlebar-h)', zIndex: 100 }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <motion.div
            whileHover={{ rotate: -8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, marginRight: 8, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}
          >
            📝
          </motion.div>
          <strong style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginRight: 16 }}>笔记</strong>
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>笔记列表</NavLink>
          <NavLink to="/new" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>新建笔记</NavLink>
          <NavLink to="/settings" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>提醒设置</NavLink>
          {['owner', 'admin'].includes(user.role) && (
            <NavLink to="/team" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>团队与邀请</NavLink>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onOpenNas}
            title="修改 NAS 服务地址"
            className="btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            🗄️ 服务器
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.08)', padding: '5px 12px', borderRadius: 20 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 600 }}>
              {user.name?.charAt(0) || 'U'}
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>{user.name}</span>
            <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#4f46e5', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>{user.role}</span>
          </div>
          <button onClick={logout} className="btn-secondary btn-sm">退出</button>
        </div>
      </header>
      <main style={{ flex: 1, padding: '28px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>{children}</main>
    </div>
  )
}

export default function App() {
  const { user, setUser, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [nasOpen, setNasOpen] = useState(false)
  const [nasBlocking, setNasBlocking] = useState(false)
  const [nasUrl, setNasUrl] = useState('')
  const [nasReady, setNasReady] = useState(false)

  // 首启：读取已配置的 NAS 地址；未配置则强制引导
  useEffect(() => {
    if (!window.desktop?.isDesktop) {
      setNasReady(true) // 纯浏览器调试，走 Vite proxy，无需引导
      return
    }
    window.desktop.getConfig().then((cfg) => {
      setNasUrl(cfg.nasBaseUrl || '')
      if (!cfg.nasBaseUrl) {
        setNasOpen(true)
        setNasBlocking(true)
      }
      setNasReady(true)
    })
  }, [])

  const openNasSettings = () => {
    setNasBlocking(false)
    setNasOpen(true)
  }

  if (loading || !nasReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 52, height: 52, borderRadius: 15, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
        >
          📝
        </motion.div>
        <div className="loading-dots"><span /><span /><span /></div>
      </div>
    )
  }

  const handleAuthSuccess = (token: string, u: User) => {
    setToken(token)
    setUser(u)
    navigate('/')
  }

  const handleNasSaved = (url: string) => {
    setNasUrl(url)
    setNasOpen(false)
    setNasBlocking(false)
  }

  const wrap = (el: React.ReactNode) =>
    user ? (
      <Layout user={user} logout={logout} onOpenNas={openNasSettings}>
        {el}
      </Layout>
    ) : (
      <Navigate to="/login" />
    )

  return (
    <ToastProvider>
      <NasConfig open={nasOpen} initialUrl={nasUrl} blocking={nasBlocking} onClose={nasBlocking ? undefined : () => setNasOpen(false)} onSaved={handleNasSaved} />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login onSuccess={handleAuthSuccess} onNeedNas={openNasSettings} />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register onSuccess={handleAuthSuccess} />} />
          <Route path="/" element={<motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">{wrap(<NotesList />)}</motion.div>} />
          <Route path="/new" element={<motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">{wrap(<NoteEditor />)}</motion.div>} />
          <Route path="/notes/:id" element={<motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">{wrap(<NoteEditor />)}</motion.div>} />
          <Route path="/settings" element={<motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">{wrap(<ReminderSettings />)}</motion.div>} />
          <Route path="/team" element={<motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">{wrap(<Team user={user!} />)}</motion.div>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </ToastProvider>
  )
}
