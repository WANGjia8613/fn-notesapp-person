/**
 * electron-builder 自定义 Windows 签名钩子
 * ============================================================
 * 作用：替换 electron-builder 内置的签名调用，按 SIGN_MODE 环境变量
 *      选择不同的签名后端。未配置证书时自动降级为「不签名」，
 *      因此这个文件常驻工程不会影响日常打包。
 *
 * 支持的模式（SIGN_MODE）：
 *   off    默认，跳过签名（打出的包 SmartScreen 会警告）
 *   pfx    传统 .pfx 证书文件（2023-06 前签发的老证书仍可用）
 *   azure  Azure Artifact Signing / 原 Trusted Signing（云 HSM）
 *          ⚠️ 个人开发者仅限美国、加拿大；组织限美加欧盟英国。中国大陆不可用。
 *   cmd    通用外部命令模式：适配任意云签名厂商 CLI
 *          （SSL.com eSigner、DigiCert KeyLocker、Certum、锐安信等）
 *
 * 凭据一律走环境变量，不要写进本文件或提交到仓库。
 * 详见 docs/代码签名指南.md
 * ============================================================
 */
const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const MODE = (process.env.SIGN_MODE || 'off').toLowerCase()

// 公共时间戳服务器：签名时打时间戳，证书过期后签名依然有效
const TIMESTAMPS = [
  'http://timestamp.digicert.com',
  'http://timestamp.sectigo.com',
  'http://timestamp.ssl.com',
]

function log(msg) {
  console.log(`[sign] ${msg}`)
}

function fail(msg) {
  throw new Error(`[sign] ${msg}`)
}

/**
 * 定位 signtool.exe（随 Windows SDK 安装）
 * 可用 SIGNTOOL_PATH 直接指定，跳过自动查找
 */
function findSigntool() {
  if (process.env.SIGNTOOL_PATH) {
    if (!fs.existsSync(process.env.SIGNTOOL_PATH)) {
      fail(`SIGNTOOL_PATH 指向的文件不存在：${process.env.SIGNTOOL_PATH}`)
    }
    return process.env.SIGNTOOL_PATH
  }

  const candidates = []
  const sdkRoot = process.env.SIGNTOOL_SDK_ROOT || 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  if (fs.existsSync(sdkRoot)) {
    const versions = fs
      .readdirSync(sdkRoot)
      .filter((d) => /^\d+\.\d+/.test(d))
      .sort()
      .reverse() // 优先高版本 SDK
    for (const v of versions) {
      candidates.push(path.join(sdkRoot, v, 'x64', 'signtool.exe'))
      candidates.push(path.join(sdkRoot, v, 'x86', 'signtool.exe'))
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

/**
 * 执行「命令行模板」：交给系统 shell 解析
 *
 * 为什么用 shell 而不是 argv 数组：
 * 1. SIGN_COMMAND 的语义就是命令行模板，用户可能写管道、重定向、厂商 CLI 的复杂参数，
 *    交给 shell 解析最符合预期；
 * 2. Node.js 自 18.20.2 / 20.12.2 / 21.7.3 起（CVE-2024-27980 修复），
 *    直接 spawn `.bat` / `.cmd` 会抛 EINVAL。而云签名厂商的 CLI 经常以 .cmd 垫片形式存在
 *    （例如 npm 全局安装的工具），走 shell 可绕开这个限制；
 * 3. 手动给 cmd.exe /c 拼引号会与 Node 的自动引号规则冲突，产生「文件名、目录名语法不正确」。
 *
 * 安全说明：SIGN_COMMAND 由开发者自己在环境变量中设置，不是外部不可信输入。
 * 待签名文件路径来自 electron-builder，已做引号包裹与内部引号转义。
 */
function runCommandTemplate(template, filePath, label) {
  // 转义路径内部的双引号，再用双引号包裹，保证含空格/中文路径作为单个参数传递
  const quoted = '"' + String(filePath).replace(/"/g, '\\"') + '"'
  const full = template.replace(/\{file\}/g, quoted)

  try {
    execSync(full, { stdio: 'pipe', windowsHide: true })
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : ''
    const stdout = e.stdout ? e.stdout.toString().trim() : ''
    fail(`${label} 失败\n  命令: ${full}\n  ${stderr || stdout || e.message}`)
  }
}

/** 带时间戳的 signtool 签名：逐个时间戳服务器尝试，任一成功即可 */
function signtoolSign(signtool, filePath, coreArgs, label) {
  let lastErr = null
  for (const ts of TIMESTAMPS) {
    const args = ['sign', ...coreArgs, '/tr', ts, '/td', 'sha256', '/fd', 'sha256']
    // 双哈希嵌套签名（isNest）时加 /as，把第二个签名附加到已有签名上
    if (label === 'nest') args.push('/as')
    try {
      execFileSync(signtool, [...args, filePath], { stdio: 'pipe', windowsHide: true })
      log(`已签名（时间戳 ${new URL(ts).host}）：${path.basename(filePath)}`)
      return
    } catch (e) {
      lastErr = e
      const stderr = e.stderr ? e.stderr.toString() : ''
      // 时间戳服务器临时故障才换下一个；证书/文件本身的问题直接抛
      if (!/timestamp|time stamp|0x80072ee2|WinHttp/i.test(stderr)) {
        fail(`签名失败：${stderr.trim() || e.message}\n  文件: ${filePath}`)
      }
    }
  }
  fail(`所有时间戳服务器均不可用，签名未完成。最后一次错误：${lastErr ? lastErr.message : '未知'}`)
}

// ============================================================
// 各签名后端
// ============================================================

function signWithPfx(filePath, isNest) {
  const certFile = process.env.SIGN_PFX_PATH
  const certPass = process.env.SIGN_PFX_PASSWORD
  if (!certFile) fail('SIGN_MODE=pfx 需要设置 SIGN_PFX_PATH（证书文件路径）')
  if (!fs.existsSync(certFile)) fail(`证书文件不存在：${certFile}`)
  if (!certPass) fail('SIGN_MODE=pfx 需要设置 SIGN_PFX_PASSWORD（证书密码，请勿写进代码）')

  const signtool = findSigntool()
  if (!signtool) fail('未找到 signtool.exe，请安装 Windows SDK，或用 SIGNTOOL_PATH 指定其路径')

  const core = ['/f', certFile, '/p', certPass]
  signtoolSign(signtool, filePath, core, isNest ? 'nest' : 'primary')
}

function signWithAzure(filePath, isNest) {
  const meta = process.env.AZURE_CODE_SIGN_METADATA
  const dlib = process.env.AZURE_CODE_SIGN_DLIB
  if (!meta || !fs.existsSync(meta)) {
    fail('SIGN_MODE=azure 需要设置 AZURE_CODE_SIGN_METADATA 指向 metadata.json（见 build/sign-metadata.example.json）')
  }
  const signtool = findSigntool()
  if (!signtool) fail('未找到 signtool.exe，请安装 Windows SDK，或用 SIGNTOOL_PATH 指定其路径')

  // Azure 签名走 signtool 的 dlib 扩展；未指定 dlib 时尝试常见安装位置
  let dlibPath = dlib
  if (!dlibPath) {
    const guesses = [
      'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\Azure.CodeSigning.Dlib.dll',
      path.join(process.cwd(), 'node_modules', 'azure-sign-tool', 'Azure.CodeSigning.Dlib.dll'),
    ]
    dlibPath = guesses.find((g) => fs.existsSync(g))
  }
  if (!dlibPath) {
    fail('未找到 Azure.CodeSigning.Dlib.dll，请安装 Azure Trusted Signing 的 signtool 扩展，并用 AZURE_CODE_SIGN_DLIB 指定路径')
  }

  const core = ['/v', '/dlib', dlibPath, '/dmdf', meta]
  signtoolSign(signtool, filePath, core, isNest ? 'nest' : 'primary')
}

function signWithExternalCommand(filePath, isNest) {
  // SIGN_COMMAND 里用 {file} 占位符表示待签名文件路径
  // 例：SIGN_COMMAND="C:\tools\esigner.exe sign --file {file} --hash sha256"
  const tpl = process.env.SIGN_COMMAND
  if (!tpl) fail('SIGN_MODE=cmd 需要设置 SIGN_COMMAND（含 {file} 占位符的完整签名命令）')
  if (!tpl.includes('{file}')) fail('SIGN_COMMAND 必须包含 {file} 占位符，用于插入待签名文件路径')

  // 交给 shell 解析（见 runCommandTemplate 的说明：兼容 .cmd 垫片、支持复杂参数）
  if (isNest) {
    log('外部命令模式由厂商 CLI 自行决定哈希算法，跳过双哈希嵌套的第二轮')
    return
  }
  runCommandTemplate(tpl, filePath, '外部签名命令')
}

/**
 * electron-builder 调用入口
 * @param {object} configuration - 含 path（待签文件）、hash、isNest 等
 */
exports.default = async function sign(configuration) {
  if (MODE === 'off' || MODE === '' || MODE === 'skip') {
    // 静默跳过：保持日常打包体验不变
    return
  }

  const filePath = configuration.path
  const isNest = !!configuration.isNest

  if (!filePath || !fs.existsSync(filePath)) {
    fail(`待签名文件不存在：${filePath}`)
  }

  // 只对可执行文件签名，跳过 .blockmap / .yml 等附属产物
  const ext = path.extname(filePath).toLowerCase()
  if (!['.exe', '.dll', '.node', '.msi'].includes(ext)) {
    return
  }

  log(`模式=${MODE} 目标=${path.basename(filePath)}${isNest ? '（嵌套）' : ''}`)

  switch (MODE) {
    case 'pfx':
      signWithPfx(filePath, isNest)
      break
    case 'azure':
      signWithAzure(filePath, isNest)
      break
    case 'cmd':
      signWithExternalCommand(filePath, isNest)
      break
    default:
      fail(`未知的 SIGN_MODE：${MODE}（可选 off / pfx / azure / cmd）`)
  }
}

// 允许作为独立脚本运行，对单个文件手动签名（排查问题用）
if (require.main === module) {
  const target = process.argv[2]
  if (!target) {
    console.error('用法：node build/sign.js <要签名的文件> [nest]')
    console.error('需先设置 SIGN_MODE 及对应凭据环境变量')
    process.exit(1)
  }
  exports
    .default({ path: target, isNest: process.argv[3] === 'nest' })
    .then(() => {
      log('完成')
    })
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
