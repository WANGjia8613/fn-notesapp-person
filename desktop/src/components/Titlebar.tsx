import { useEffect, useState } from 'react'

// 自绘毛玻璃标题栏：桌面壳无边框窗口的拖动区 + 系统按钮
// 纯浏览器调试时（无 window.desktop）自动隐藏
export default function Titlebar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.desktop) return
    window.desktop.isMaximized().then(setMaximized)
    const onResize = () => window.desktop?.isMaximized().then(setMaximized)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!window.desktop?.isDesktop) return null

  return (
    <div className="titlebar">
      <div className="tb-brand">
        <div className="tb-logo">📝</div>
        <span>笔记</span>
      </div>
      <div className="tb-spacer" />
      <div className="tb-controls">
        <button className="tb-btn" title="最小化" onClick={() => window.desktop?.minimize()}>
          <svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor" /></svg>
        </button>
        <button className="tb-btn" title={maximized ? '还原' : '最大化'} onClick={() => window.desktop?.maximize()}>
          {maximized ? (
            <svg viewBox="0 0 12 12">
              <rect x="2.5" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M4 4V3.2A1 1 0 0 1 5 2.2h3.8A1 1 0 0 1 9.8 3.2V7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )}
        </button>
        <button className="tb-btn close" title="关闭" onClick={() => window.desktop?.close()}>
          <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  )
}
