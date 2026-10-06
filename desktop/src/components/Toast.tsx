import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toastVariants } from '../motion'

type ToastType = 'success' | 'error' | 'info'
interface Toast {
  id: number
  msg: string
  type: ToastType
}

interface ToastCtx {
  show: (msg: string, type?: ToastType) => void
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const Ctx = createContext<ToastCtx>({ show: () => {}, success: () => {}, error: () => {}, info: () => {} })

export function useToast() {
  return useContext(Ctx)
}

const iconOf: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ⓘ',
}
const colorOf: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  info: '#6366f1',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((msg: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, type }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, type === 'error' ? 4200 : 2400)
  }, [])

  const value: ToastCtx = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-host">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              variants={toastVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 18px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.82)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text)',
                pointerEvents: 'auto',
                maxWidth: '80vw',
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: colorOf[t.type],
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {iconOf[t.type]}
              </span>
              <span>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
