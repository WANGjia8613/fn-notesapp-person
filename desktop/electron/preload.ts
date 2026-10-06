import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 暴露最小必要接口，渲染层无法直接触达 Node/系统能力
contextBridge.exposeInMainWorld('desktop', {
  // 窗口控制（自绘标题栏用）
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),

  // 配置读写
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: Record<string, any>) => ipcRenderer.invoke('config:set', patch),

  // 外部链接交给系统浏览器
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // 标识运行在桌面壳内（渲染层据此决定 API 基址）
  isDesktop: true,
})
