# 笔记 · Windows 桌面版

基于 [fn-notesapp-person](https://github.com/WANGjia8613/fn-notesapp-person) 开发的 **Windows 桌面客户端**。
桌面端负责界面与交互，数据仍存放在你部署于飞牛 NAS（或任意 Docker 环境）的后端上——**不改动后端任何代码**，也不需要在 NAS 上额外开启跨域（CORS）。

---

## ✨ 相比网页版的增强

| 能力 | 说明 |
|---|---|
| 🖥️ 原生窗口体验 | 无边框毛玻璃窗口 + 自绘标题栏，可拖动、最小化/最大化/关闭，记忆窗口位置尺寸 |
| 🔗 免配置连后端 | 首启引导填写 NAS 地址；本机内置中转代理转发请求，规避浏览器 CORS，NAS 零改动 |
| 🎞️ 苹果质感动效 | 页面转场、列表交错入场、卡片光标跟随高光、弹性模态、骨架屏、Toast 轻提示，统一弹簧缓动曲线 |
| 💾 编辑器自动保存 | 编辑已有笔记时内容变化后 2 秒静默保存，支持 `Ctrl+S` 手动保存 |
| 🗑️ 桌面级删除确认 | 弹性确认弹窗替代原生 `confirm` |
| 🌐 外链走系统浏览器 | 笔记内的链接点击后在默认浏览器打开，不在应用内跳转 |

功能上与网页版对齐：Markdown / 富文本（TipTap）双格式正文、Mermaid 图表、图片即传即用、标签、到期/提醒、私有笔记与共享成员、团队邀请、邮件汇总、Webhook、iCal 日历订阅、AI 周总结。

---

## 🚀 直接运行（推荐给普通用户）

构建产物在 `release/` 目录，两种形式任选：

1. **安装程序**：`笔记-安装程序-1.0.0.exe`（NSIS 安装包，可选安装路径，自动创建桌面/开始菜单快捷方式）
2. **绿色版**：`笔记-绿色版-1.0.0.exe`（免安装，双击即用，适合放 U 盘）

> 首次运行 Windows SmartScreen 可能提示「未知发布者」，点「更多信息 → 仍要运行」即可（未做代码签名，属正常现象）。

---

## 🔧 从源码构建（开发者）

### 环境要求
- Node.js ≥ 18（推荐 20 LTS）
- Windows 10/11

### 步骤
```powershell
# 1. 安装依赖（Electron 走国内镜像，速度快）
npm install

# 2. 开发模式（热更新）
npm run dev

# 3. 生产构建（编译 + 打包渲染层 + 编译 Electron 主进程）
npm run build

# 4. 打包 Windows 可执行程序（输出到 release/）
npm run dist           # 生成 NSIS 安装包 + 绿色版
npm run dist:portable  # 仅绿色版
npm run pack           # 仅解包目录（不生成安装程序，调试用）
```

若 Electron 下载慢或失败，可设置镜像环境变量后再装：
```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

---

## 📖 使用说明

### 1. 首次启动：连接 NAS
启动后会弹出「连接你的 NAS 服务」引导：
- 填写后端访问地址，即你平时用浏览器打开笔记应用的地址，例如 `http://192.168.1.10:8080`
- 点「连接并保存」，应用会探测连通性
- 配置保存在本机用户数据目录，之后启动无需重填

> 需要修改地址时，点顶栏右侧「🗄️ 服务器」按钮即可重新配置。

### 2. 登录
用你在 NAS 上的账号登录（seed 默认是 `admin@example.com`，密码见你的 `.env` 或 seed 输出）。

### 3. 邀请成员
- 管理员进入「团队与邀请」页，填邮箱 + 选有效期 → 生成邀请链接
- 链接会**自动复制到剪贴板**，直接发给对方
- 对方在**浏览器**打开链接注册（桌面端打不开网页注册链接；若对方也用桌面版，可把链接里的 token 粘到桌面版注册页）

### 4. 写笔记
- 「新建笔记」默认富文本，工具栏按钮化操作；也可用 `#/new?format=markdown` 走 Markdown
- Markdown 笔记支持 ` ```mermaid ` 图表，切到「预览」渲染
- 编辑器内可直接粘贴/拖拽/点击插入图片，自动上传为附件

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.ts)          │
│  · 无边框窗口 + 自绘标题栏 IPC               │
│  · 本地反向代理 http://127.0.0.1:<随机端口>  │
│    └─ 转发 /api/* → 用户配置的 NAS           │
│  · config.json 持久化（NAS 地址/窗口状态）   │
└─────────────────────────────────────────────┘
                  ▲ contextBridge (preload.ts)
                  │ window.desktop.*
┌─────────────────────────────────────────────┐
│  渲染层 (React 18 + Vite + TypeScript)       │
│  · HashRouter（适配 file:// 加载）           │
│  · api.ts：动态基址指向本地代理              │
│  · framer-motion：全站动效                   │
│  · TipTap 富文本 / react-markdown + Mermaid  │
└─────────────────────────────────────────────┘
```

### 为什么用「本地反向代理」而不是直连 NAS？
浏览器/Electron 渲染层直连不同源的 NAS 会触发 CORS，而原后端 **CORS 默认关闭**（安全设计）。
桌面版在主进程起一个只监听 `127.0.0.1` 的本地代理，渲染层始终「同源」请求本地端口，由主进程转发到 NAS。
这样：① 无需改后端；② 无需在 NAS 开 CORS；③ 请求体（含图片 multipart 上传）用流式管道转发，天然支持大文件。

### 目录结构
```
fn-notes-desktop/
├── electron/
│   ├── main.ts            # 主进程：窗口 + 本地代理 + 配置
│   ├── preload.ts         # 安全桥接 window.desktop
│   └── tsconfig.json
├── src/
│   ├── main.tsx           # React 入口（HashRouter）
│   ├── App.tsx            # 路由 + 布局 + NAS 引导 + 页面转场
│   ├── api.ts             # 后端接口封装（动态基址）
│   ├── types.ts           # 数据类型（对齐后端）
│   ├── motion.ts          # 统一动效变量（弹簧/缓动/转场）
│   ├── styles.css         # 设计系统 + 动画基建
│   ├── desktop.d.ts       # 桌面桥接类型
│   ├── components/
│   │   ├── Titlebar.tsx       # 自绘标题栏
│   │   ├── Toast.tsx          # 轻提示系统
│   │   ├── NasConfig.tsx      # NAS 地址配置弹窗
│   │   ├── NoteSidebar.tsx    # 笔记属性侧栏
│   │   ├── RichTextBody.tsx   # TipTap 富文本
│   │   ├── MarkdownBody.tsx   # Markdown + Mermaid
│   │   └── editor/
│   │       ├── EditorToolbar.tsx  # 富文本工具栏
│   │       └── useImageUpload.tsx # 图片上传/粘贴/拖拽
│   └── pages/
│       ├── Login.tsx / Register.tsx
│       ├── NotesList.tsx        # 列表（交错入场 + 光标高光）
│       ├── NoteEditor.tsx       # 编辑器（双格式 + 自动保存）
│       ├── ReminderSettings.tsx # 提醒/Webhook/日历/LLM/AI
│       └── Team.tsx             # 团队与邀请
├── vite.config.ts
├── electron-builder.yml
├── package.json
└── tsconfig*.json
```

---

## 🔒 安全说明
- 渲染层 `contextIsolation: true` + `nodeIntegration: false`，通过 `preload` 暴露最小接口，网页无法直接触达 Node/系统能力
- 本地代理只监听 `127.0.0.1`，不对外暴露
- 登录 token 存于渲染层 `localStorage`，随应用卸载清除；NAS 地址等配置存于用户数据目录
- 外链一律交系统浏览器，杜绝应用内钓鱼跳转
- 附件沿用后端策略：仅图片可内联，其余强制下载并禁用嗅探

---

## 📝 License
MIT — 与上游项目一致。本项目为在开源项目基础上的桌面端二次开发。
