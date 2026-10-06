import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { URL } from 'url'

const isDev = !!process.env.VITE_DEV_SERVER_URL
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null
let proxyPort = 0 // 本地反向代理端口，渲染层据此拼接 API 基址

// 配置文件（NAS 地址、窗口状态等）落在用户数据目录，卸载/升级不丢
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(cfg: Record<string, any>): void {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (e) {
    console.error('写入配置失败', e)
  }
}

// ============================================================
// 本地反向代理：渲染层同源请求 http://127.0.0.1:<port>/api/*
// 由主进程转发到用户配置的 NAS，规避浏览器 CORS，且 NAS 后端零改动。
// ============================================================
function startProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((clientReq, clientRes) => {
      const cfg = readConfig()
      const base: string = (cfg.nasBaseUrl || '').replace(/\/$/, '')
      if (!base) {
        clientRes.writeHead(503, { 'Content-Type': 'application/json' })
        clientRes.end(JSON.stringify({ error: '尚未配置 NAS 服务地址，请先在设置中填写' }))
        return
      }

      let target: URL
      try {
        target = new URL(clientReq.url || '/', base)
      } catch {
        clientRes.writeHead(400, { 'Content-Type': 'application/json' })
        clientRes.end(JSON.stringify({ error: 'NAS 地址无效' }))
        return
      }

      const isHttps = target.protocol === 'https:'
      const net = isHttps ? require('https') : http
      // 拷贝请求头到明确类型的对象，去掉会让 NAS/nginx 拒绝的头
      const fwdHeaders: Record<string, any> = { ...clientReq.headers }
      delete fwdHeaders['host']
      delete fwdHeaders['origin']
      delete fwdHeaders['referer']
      fwdHeaders['host'] = target.host

      const options: http.RequestOptions = {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname + target.search,
        method: clientReq.method,
        headers: fwdHeaders,
      }

      const proxyReq = net.request(options, (proxyRes: http.IncomingMessage) => {
        const headers = { ...proxyRes.headers }
        // 放开跨域与内容嗅探限制，桌面同源场景下安全
        headers['access-control-allow-origin'] = '*'
        clientRes.writeHead(proxyRes.statusCode || 200, headers)
        proxyRes.pipe(clientRes)
      })

      proxyReq.on('error', (err: Error) => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json' })
        }
        clientRes.end(JSON.stringify({ error: '无法连接 NAS：' + err.message }))
      })

      // 请求体（含 multipart 上传）直接管道转发，天然支持大文件与流
      clientReq.pipe(proxyReq)
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(port)
    })
  })
}

function createWindow(): void {
  const cfg = readConfig()
  const winState = cfg.windowState || {}

  mainWindow = new BrowserWindow({
    width: winState.width || 1280,
    height: winState.height || 820,
    minWidth: 940,
    minHeight: 600,
    x: winState.x,
    y: winState.y,
    show: false,
    frame: false, // 无边框，用渲染层自绘毛玻璃标题栏
    titleBarStyle: 'hidden',
    backgroundColor: '#eef2ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // 外链一律交给系统默认浏览器，不在应用内打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  const saveWindowState = () => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    const c = readConfig()
    c.windowState = { x: b.x, y: b.y, width: b.width, height: b.height }
    writeConfig(c)
  }
  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== IPC：窗口控制 =====
ipcMain.on('win:minimize', () => mainWindow?.minimize())
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('win:close', () => mainWindow?.close())
ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ===== IPC：配置读写（NAS 地址等）=====
ipcMain.handle('config:get', () => ({ ...readConfig(), proxyPort }))
ipcMain.handle('config:set', (_e, patch: Record<string, any>) => {
  const c = { ...readConfig(), ...patch }
  writeConfig(c)
  return { ...c, proxyPort }
})

// ===== IPC：用系统浏览器打开外部链接 =====
ipcMain.handle('shell:openExternal', (_e, url: string) => {
  if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  return Promise.resolve()
})

app.whenReady().then(async () => {
  try {
    proxyPort = await startProxy()
  } catch (e) {
    console.error('本地代理启动失败', e)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
