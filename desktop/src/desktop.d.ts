// Electron 预加载脚本通过 contextBridge 暴露的桌面接口类型声明
export interface DesktopBridge {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  getConfig: () => Promise<{ nasBaseUrl?: string; proxyPort?: number; [k: string]: any }>
  setConfig: (patch: Record<string, any>) => Promise<{ nasBaseUrl?: string; proxyPort?: number; [k: string]: any }>
  openExternal: (url: string) => Promise<void>
  isDesktop: true
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

export {}
