import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { modalVariants, overlayVariants } from '../motion'

interface Props {
  open: boolean
  initialUrl?: string
  onClose?: () => void
  onSaved: (url: string) => void
  // 是否为「首启强制引导」：不可关闭，必须配置成功
  blocking?: boolean
}

// NAS 服务地址配置：桌面版连接后端的入口
// 校验逻辑：填地址 -> 尝试探测（用登录接口的连通性判断）-> 持久化到主进程配置
export default function NasConfig({ open, initialUrl = '', onClose, onSaved, blocking }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && initialUrl) setUrl(initialUrl)
  }, [open, initialUrl])

  const normalize = (v: string) => v.trim().replace(/\/+$/, '')

  const test = async (): Promise<boolean> => {
    const base = normalize(url)
    if (!base) {
      setError('请填写 NAS 服务地址')
      return false
    }
    if (!/^https?:\/\//i.test(base)) {
      setError('地址需以 http:// 或 https:// 开头')
      return false
    }
    setTesting(true)
    setError('')
    try {
      // 先写入配置，让本地代理指向该地址
      if (window.desktop) await window.desktop.setConfig({ nasBaseUrl: base })
      // 探测连通性：调用 /auth/me，能拿到 JSON 响应即视为可达
      // （401/未登录也算连通，说明后端在线）
      const res = await fetch(base.replace(/\/$/, '') + '/api/auth/me', { method: 'GET' })
      // 只要不是网络层失败（能拿到任意 HTTP 状态码），就说明后端可达
      if (res.status >= 200 && res.status < 600) {
        onSaved(base)
        return true
      }
      setError('无法连接到该地址，请检查 NAS 是否在线、端口是否正确')
      return false
    } catch (e) {
      setError(e instanceof Error ? '连接失败：' + e.message : '连接失败，请检查地址')
      return false
    } finally {
      setTesting(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await test()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15,23,42,0.28)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            padding: 20,
          }}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="glass"
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '32px 30px',
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.1 }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  margin: '0 auto 14px',
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                }}
              >
                🗄️
              </motion.div>
              <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
                连接你的 NAS 服务
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                桌面版通过你部署在飞牛 NAS（或任意 Docker 环境）上的后端读写数据。
                <br />
                请填写后端访问地址，即你平时浏览器打开笔记应用的那个地址。
              </p>
            </div>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  NAS 服务地址
                </label>
                <input
                  autoFocus
                  placeholder="http://192.168.1.10:8080"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-glass"
                  style={{ fontFamily: 'SF Mono, Consolas, monospace', fontSize: 13.5 }}
                />
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                  通常是 <code>http://你的NAS_IP:8080</code>，端口由 .env 的 APP_PORT 决定
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{
                      color: '#dc2626',
                      fontSize: 13,
                      background: 'rgba(220,38,38,0.08)',
                      padding: '10px 12px',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {!blocking && onClose && (
                  <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>
                    取消
                  </button>
                )}
                <button type="submit" disabled={testing} className="btn-primary" style={{ flex: 2, opacity: testing ? 0.7 : 1 }}>
                  {testing ? '连接测试中…' : '连接并保存'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--border-strong)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              💡 提示：桌面版会在本机起一个中转，把你的请求转发到 NAS，因此无需在 NAS 上额外开启跨域（CORS）设置，也不改动后端任何配置。
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
