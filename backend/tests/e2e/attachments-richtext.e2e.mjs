/**
 * 端到端测试：富文本笔记 + 附件 token 全链路
 *
 * 真实 HTTP 请求打真实后端，真实 PostgreSQL 存数据，不使用任何 mock。
 * 只测跨进程边界才能验证的行为：HTTP 状态码、响应头、落库结果、权限判定。
 * 纯函数（消毒 / HTML 转文本 / 权限判定）由 src/utils/*.test.ts 覆盖，这里不重复。
 *
 * 运行方式见同目录 README.md，或直接在 backend/ 下执行 `npm run test:e2e`。
 *
 * 环境变量：
 *   E2E_BASE_URL        后端地址，默认 http://127.0.0.1:3100
 *   E2E_ADMIN_EMAIL     管理员邮箱，默认 admin@e2e.test
 *   E2E_ADMIN_PASSWORD  管理员密码，默认 E2E_Admin_2026!
 *   E2E_DATABASE_URL    可选。提供时用于构造「外部团队」用户做跨团队隔离测试；
 *                       缺失则跳过这部分（例如对着远端容器跑测试时）
 *   E2E_UPLOAD_DIR      可选。提供时额外校验文件是否真的落盘
 */
import fs from 'node:fs'
import crypto from 'node:crypto'

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2E_Admin_2026!'
const RUN_ID = crypto.randomBytes(4).toString('hex')

const results = []
let curGroup = ''
const skipped = []

function group(name) {
  curGroup = name
  console.log(`\n\x1b[1m── ${name}\x1b[0m`)
}
function check(name, cond, detail = '') {
  results.push({ group: curGroup, name, pass: !!cond, detail })
  console.log(
    `${cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ''}`,
  )
}
function skip(name, reason) {
  skipped.push({ name, reason })
  console.log(`\x1b[33m⊘\x1b[0m ${name} \x1b[90m（跳过：${reason}）\x1b[0m`)
}

async function req(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, { method, headers, body: payload })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, headers: res.headers, json, text }
}

async function login(email, password) {
  const r = await req('POST', '/api/auth/login', { body: { email, password } })
  return r.json?.token
}

/** 1x1 PNG，70 字节 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function upload(token, filename, mime, buf, noteId) {
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: mime }), filename)
  if (noteId) fd.append('noteId', noteId)
  const res = await fetch(BASE + '/api/attachments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

const ids = (r) => (r.json?.notes ?? r.json ?? []).map?.((n) => n.id) ?? []
const ok = (s) => s === 200 || s === 201

/**
 * 「外部团队」用户：用于验证跨 workspace 隔离。
 * 系统没有对外的「创建团队」接口（注册是邀请制），只能直接建库记录。
 * 因此需要 E2E_DATABASE_URL；拿不到就返回 null，调用方跳过相关断言。
 */
async function makeOutsider() {
  if (!process.env.E2E_DATABASE_URL) return null
  try {
    const { PrismaClient } = await import('@prisma/client')
    const bcrypt = (await import('bcryptjs')).default
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    })
    const email = `outsider-${RUN_ID}@other.test`
    const ws = await prisma.workspace.create({ data: { name: `外部团队-${RUN_ID}` } })
    await prisma.user.create({
      data: {
        workspaceId: ws.id,
        email,
        name: '外部用户',
        role: 'owner',
        passwordHash: await bcrypt.hash('Outsider_2026!', 10),
      },
    })
    await prisma.$disconnect()
    return { email, password: 'Outsider_2026!' }
  } catch (e) {
    console.log(`\x1b[33m外部用户创建失败，跨团队用例将被跳过：${e.message}\x1b[0m`)
    return null
  }
}

const main = async () => {
  console.log(`\x1b[1m端到端测试 → ${BASE}\x1b[0m  (run ${RUN_ID})`)

  // ================= A. 认证 =================
  group('A. 认证与鉴权')
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  if (!admin) {
    console.error(`\x1b[31m无法以 ${ADMIN_EMAIL} 登录，测试终止。请确认后端已启动且已 seed。\x1b[0m`)
    process.exit(2)
  }
  check('管理员登录返回 JWT', true)

  const badPw = await req('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: 'wrong-password' },
  })
  check('错误密码被拒 401', badPw.status === 401, `实际 ${badPw.status}`)

  const noAuth = await req('GET', '/api/notes')
  check('无 token 访问笔记列表 401', noAuth.status === 401, `实际 ${noAuth.status}`)

  const garbage = await req('GET', '/api/notes', { token: 'not.a.jwt' })
  check('伪造 token 被拒 401', garbage.status === 401, `实际 ${garbage.status}`)

  const me = await req('GET', '/api/auth/me', { token: admin })
  check('/api/auth/me 返回当前用户', me.status === 200 && !!me.json?.email, me.json?.email ?? '')

  // 同团队 member
  const memberEmail = `member-${RUN_ID}@same.test`
  const inv = await req('POST', '/api/invitations', {
    token: admin,
    body: { email: memberEmail, expiresInDays: 7 },
  })
  const invToken = inv.json?.token ?? inv.json?.invitation?.token
  const reg = invToken
    ? await req('POST', '/api/auth/register', {
        body: { token: invToken, name: '同团队成员', password: 'Member_2026!' },
      })
    : null
  const memberToken = reg?.json?.token
  check('邀请制注册同团队成员成功', !!memberToken, `邀请 ${inv.status} / 注册 ${reg?.status}`)

  const outsiderCred = await makeOutsider()
  const outsider = outsiderCred ? await login(outsiderCred.email, outsiderCred.password) : null
  if (outsider) check('外部团队用户登录成功', true)

  // ================= B. Markdown 回归 =================
  group('B. Markdown 笔记回归（存量行为不变）')
  const md = await req('POST', '/api/notes', {
    token: admin,
    body: {
      title: `Markdown 回归 ${RUN_ID}`,
      bodyMd: '# 标题\n\n这是回归测试正文 KEYWORD_MD',
      tags: ['回归'],
    },
  })
  check('创建 Markdown 笔记成功', ok(md.status), `实际 ${md.status} ${md.text?.slice(0, 100)}`)
  const mdNote = md.json
  check('bodyFormat 默认 markdown', mdNote?.bodyFormat === 'markdown', mdNote?.bodyFormat)
  check('bodyMd 原样保存', mdNote?.bodyMd?.includes('KEYWORD_MD'))
  check('bodyHtml 为空（两种格式互斥）', mdNote?.bodyHtml === '', JSON.stringify(mdNote?.bodyHtml))
  check('bodyText 派生自 bodyMd', (mdNote?.bodyText ?? '').includes('KEYWORD_MD'))

  // ================= C. 富文本 =================
  group('C. 富文本（HTML）笔记')
  const XSS = [
    '<p>正常段落 RICHTEXT_KEY</p>',
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(2)">',
    '<a href="javascript:alert(3)">点我</a>',
    '<iframe src="https://evil.test"></iframe>',
    '<div style="background:url(javascript:alert(4))">样式</div>',
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>待办项</p></div></li></ul>',
    '<pre><code class="language-mermaid">graph TD;A--&gt;B;</code></pre>',
    '<a href="https://example.com" target="_blank">外链</a>',
  ].join('')

  const rich = await req('POST', '/api/notes', {
    token: admin,
    body: {
      title: `富文本笔记 ${RUN_ID}`,
      bodyFormat: 'html',
      bodyHtml: XSS,
      bodyJson: '{"type":"doc","content":[]}',
      bodyMd: '# 这段应该被清空',
      bodyText: '前端伪造的搜索文本 SHOULD_NOT_APPEAR',
      tags: ['富文本'],
    },
  })
  check('创建富文本笔记成功', ok(rich.status), `实际 ${rich.status} ${rich.text?.slice(0, 120)}`)
  const richNote = rich.json
  const html = richNote?.bodyHtml ?? ''

  check('bodyFormat=html', richNote?.bodyFormat === 'html', richNote?.bodyFormat)
  check('<script> 被剥离', !/<script/i.test(html))
  check('onerror 事件属性被剥离', !/onerror/i.test(html))
  check('javascript: 链接被处理', !/javascript:/i.test(html))
  check('<iframe> 被剥离', !/<iframe/i.test(html))
  check('内联 style 被剥离', !/<div style=/i.test(html))
  check('正常段落保留', html.includes('RICHTEXT_KEY'))
  check('任务清单结构保留', /data-type="taskList"/.test(html) && /type="checkbox"/.test(html))
  check('mermaid 代码块类名保留', /language-mermaid/.test(html))
  check(
    '外链强制 rel 加固',
    /rel="[^"]*noopener[^"]*"/.test(html),
    html.match(/<a href="https:\/\/example\.com"[^>]*>/)?.[0] ?? '',
  )
  check('bodyMd 被强制清空（回滚到旧代码时不会把 HTML 当 Markdown 渲染）', richNote?.bodyMd === '', JSON.stringify(richNote?.bodyMd))
  check(
    '前端伪造的 bodyText 被忽略',
    !/SHOULD_NOT_APPEAR/.test(richNote?.bodyText ?? ''),
    (richNote?.bodyText ?? '').slice(0, 50),
  )
  check(
    'bodyText 由服务端派生为纯文本',
    (richNote?.bodyText ?? '').includes('RICHTEXT_KEY') && !/<[a-z]/i.test(richNote?.bodyText ?? ''),
  )
  check('bodyJson 原样保存', richNote?.bodyJson === '{"type":"doc","content":[]}')

  const badFmt = await req('POST', '/api/notes', {
    token: admin,
    body: { title: 'x', bodyFormat: 'rtf', bodyMd: 'y' },
  })
  check('非法 bodyFormat 被拒 4xx', badFmt.status >= 400 && badFmt.status < 500, `实际 ${badFmt.status}`)

  const tooLong = await req('POST', '/api/notes', {
    token: admin,
    body: { title: 'x'.repeat(201), bodyMd: 'y' },
  })
  check('超长标题被拒 4xx', tooLong.status >= 400 && tooLong.status < 500, `实际 ${tooLong.status}`)

  check('按富文本正文关键词可搜到', ids(await req('GET', '/api/notes?q=RICHTEXT_KEY', { token: admin })).includes(richNote.id))
  check('搜 HTML 标签名不命中富文本笔记', !ids(await req('GET', '/api/notes?q=script', { token: admin })).includes(richNote.id))
  check('Markdown 笔记搜索仍正常', ids(await req('GET', '/api/notes?q=KEYWORD_MD', { token: admin })).includes(mdNote.id))

  const upd = await req('PUT', `/api/notes/${richNote.id}`, {
    token: admin,
    body: { title: '富文本（已改）', bodyFormat: 'html', bodyHtml: '<p>UPDATED_BODY</p><script>bad()</script>' },
  })
  check('更新富文本笔记成功', ok(upd.status), `实际 ${upd.status}`)
  check('更新路径同样消毒', (upd.json?.bodyHtml ?? '').includes('UPDATED_BODY') && !/<script/i.test(upd.json?.bodyHtml ?? ''))

  const single = await req('GET', `/api/notes/${richNote.id}`, { token: admin })
  check('单篇详情返回富文本字段', single.status === 200 && single.json?.bodyFormat === 'html')

  const listItem = ((await req('GET', '/api/notes', { token: admin })).json ?? [])[0]
  check(
    '列表接口不返回 bodyHtml/bodyJson（避免 take 500 时拖垮响应）',
    listItem && listItem.bodyHtml === undefined && listItem.bodyJson === undefined,
  )

  // ================= D. 附件 =================
  group('D. 附件上传与 token 下载')
  const up = await upload(admin, `测试图片-${RUN_ID}.png`, 'image/png', PNG)
  check('上传中文名 PNG 成功', ok(up.status) && !!up.json?.id, `实际 ${up.status} ${up.text?.slice(0, 100)}`)
  const att = up.json
  check('返回 64 位 hex shareToken', /^[0-9a-f]{64}$/.test(att?.shareToken ?? ''), (att?.shareToken ?? '').slice(0, 12) + '…')
  check('新上传附件 noteId 为空（待补绑）', att?.noteId === null, JSON.stringify(att?.noteId))
  check('size 与上传字节数一致', att?.size === PNG.length, `${att?.size} vs ${PNG.length}`)

  if (process.env.E2E_UPLOAD_DIR) {
    check('文件已落盘到 UPLOAD_DIR', fs.existsSync(`${process.env.E2E_UPLOAD_DIR}/${att.storagePath}`), att.storagePath)
  }

  // JWT 路径
  const dlJwt = await fetch(`${BASE}/api/attachments/${att.id}/download`, {
    headers: { Authorization: `Bearer ${admin}` },
  })
  check('JWT 路径下载中文名附件 200', dlJwt.status === 200, `实际 ${dlJwt.status}`)
  check(
    '白名单图片以 image/png + inline 返回',
    dlJwt.headers.get('content-type') === 'image/png' && /inline/.test(dlJwt.headers.get('content-disposition') ?? ''),
    dlJwt.headers.get('content-disposition') ?? '',
  )
  check('响应带 X-Content-Type-Options: nosniff', dlJwt.headers.get('x-content-type-options') === 'nosniff')
  check('响应带 CSP sandbox', (dlJwt.headers.get('content-security-policy') ?? '').includes('sandbox'))
  const cd = dlJwt.headers.get('content-disposition') ?? ''
  check('Content-Disposition 为纯 latin1（中文文件名不会让 setHeader 抛 ERR_INVALID_CHAR）', [...cd].every((c) => c.charCodeAt(0) <= 0xff))
  check('filename* 用 RFC 5987 保留中文原名', /filename\*=UTF-8''%/.test(cd) && decodeURIComponent(cd.split("filename*=UTF-8''")[1] ?? '').startsWith('测试图片-'), cd.slice(0, 110))
  const jwtBytes = Buffer.from(await dlJwt.arrayBuffer())
  check('下载字节与原文件逐字节一致', jwtBytes.equals(PNG), `${jwtBytes.length} bytes`)

  // token 路径（<img src> 场景，无 JWT）
  const dlTok = await fetch(`${BASE}/api/attachments/${att.id}/download?t=${att.shareToken}`)
  check('token 路径无 JWT 下载 200', dlTok.status === 200, `实际 ${dlTok.status}`)
  check('token 路径带 Referrer-Policy: no-referrer', dlTok.headers.get('referrer-policy') === 'no-referrer', dlTok.headers.get('referrer-policy') ?? '缺失')
  check('token 路径带 immutable 长缓存', /immutable/.test(dlTok.headers.get('cache-control') ?? ''), dlTok.headers.get('cache-control') ?? '缺失')
  check('token 路径字节一致', Buffer.from(await dlTok.arrayBuffer()).equals(PNG))

  const dlNone = await fetch(`${BASE}/api/attachments/${att.id}/download`)
  check('无 token 无 JWT 下载 401', dlNone.status === 401, `实际 ${dlNone.status}`)

  const wrongTok = await fetch(`${BASE}/api/attachments/${att.id}/download?t=${'a'.repeat(64)}`)
  const wrongBody = await wrongTok.text()
  const missing = await fetch(`${BASE}/api/attachments/no-such-id/download?t=${'a'.repeat(64)}`)
  const missingBody = await missing.text()
  check('错误 token 返回 404', wrongTok.status === 404, `实际 ${wrongTok.status}`)
  check('不存在的附件返回 404', missing.status === 404, `实际 ${missing.status}`)
  check('两者响应体一致（不提供存在性 oracle）', wrongBody === missingBody, `${wrongBody} | ${missingBody}`)

  const badTok = await fetch(`${BASE}/api/attachments/${att.id}/download?t=ZZZ-not-hex`)
  check('非法格式 token 直接 404', badTok.status === 404, `实际 ${badTok.status}`)

  const up2 = await upload(admin, 'second.png', 'image/png', PNG)
  const cross = await fetch(`${BASE}/api/attachments/${att.id}/download?t=${up2.json.shareToken}`)
  check('A 的 id 配 B 的 token → 404（防止 URL 拼接）', cross.status === 404, `实际 ${cross.status}`)

  // 非白名单 MIME
  const htmlAtt = await upload(admin, 'evil.html', 'text/html', Buffer.from('<script>alert(1)</script>'))
  check('上传 text/html 附件成功', ok(htmlAtt.status), `实际 ${htmlAtt.status}`)
  const dlHtml = await fetch(`${BASE}/api/attachments/${htmlAtt.json.id}/download?t=${htmlAtt.json.shareToken}`)
  check('HTML 附件降级为 octet-stream（同源存储型 XSS 防护）', dlHtml.headers.get('content-type') === 'application/octet-stream', dlHtml.headers.get('content-type') ?? '')
  check('HTML 附件强制 attachment 下载', /attachment/.test(dlHtml.headers.get('content-disposition') ?? ''))

  const svgAtt = await upload(admin, 'pic.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
  const dlSvg = await fetch(`${BASE}/api/attachments/${svgAtt.json.id}/download?t=${svgAtt.json.shareToken}`)
  check('SVG 同样不在 inline 白名单内', dlSvg.headers.get('content-type') === 'application/octet-stream', dlSvg.headers.get('content-type') ?? '')

  // 轮换
  const rot = await req('POST', `/api/attachments/${att.id}/token`, { token: admin })
  check('轮换 token 接口 200', rot.status === 200, `实际 ${rot.status}`)
  const newTok = rot.json?.shareToken
  check('返回新的 64 位 token 且与旧值不同', /^[0-9a-f]{64}$/.test(newTok ?? '') && newTok !== att.shareToken)
  check('旧 token 轮换后立即失效 404', (await fetch(`${BASE}/api/attachments/${att.id}/download?t=${att.shareToken}`)).status === 404)
  check('新 token 可用 200', (await fetch(`${BASE}/api/attachments/${att.id}/download?t=${newTok}`)).status === 200)

  // 补绑
  const bind = await req('PUT', `/api/attachments/${att.id}/note`, { token: admin, body: { noteId: richNote.id } })
  check('附件补绑笔记成功', bind.status === 200 && bind.json?.success === true, `实际 ${bind.status} ${bind.text}`)
  const listed = await req('GET', `/api/attachments?noteId=${richNote.id}`, { token: admin })
  check('owner 能按 noteId 列出已绑定附件', (listed.json ?? []).some((a) => a.id === att.id), `返回 ${(listed.json ?? []).length} 条`)
  const allList = (await req('GET', '/api/attachments', { token: admin })).json ?? []
  check('owner 全量列表包含已绑定附件（OR 未塌缩为 noteId:null）', allList.some((a) => a.id === att.id && a.noteId === richNote.id), `全量 ${allList.length} 条`)
  check('补绑缺 noteId → 400', (await req('PUT', `/api/attachments/${att.id}/note`, { token: admin, body: {} })).status === 400)
  check('绑定后 token 下载仍 200', (await fetch(`${BASE}/api/attachments/${att.id}/download?t=${newTok}`)).status === 200)

  // ================= E. 权限与隔离 =================
  group('E. 跨团队隔离与越权')
  if (!outsider || !memberToken) {
    skip('跨团队 / 成员权限用例', outsider ? '同团队成员注册失败' : '缺少 E2E_DATABASE_URL，无法构造外部团队用户')
  } else {
    const outIds = ids(await req('GET', '/api/notes', { token: outsider }))
    check('外部团队看不到本团队笔记', !outIds.includes(richNote.id) && !outIds.includes(mdNote.id), `命中 ${outIds.length}`)
    check('外部团队 JWT 下载本团队附件 404', (await fetch(`${BASE}/api/attachments/${att.id}/download`, { headers: { Authorization: `Bearer ${outsider}` } })).status === 404)
    check('外部团队列不到本团队附件', !((await req('GET', '/api/attachments', { token: outsider })).json ?? []).some((a) => a.id === att.id))
    check('外部团队不能轮换他人 token', [403, 404].includes((await req('POST', `/api/attachments/${att.id}/token`, { token: outsider })).status))
    check('外部团队不能改他人附件归属', [403, 404].includes((await req('PUT', `/api/attachments/${att.id}/note`, { token: outsider, body: { noteId: richNote.id } })).status))

    const priv = await req('POST', '/api/notes', {
      token: admin,
      body: { title: `私有笔记 ${RUN_ID}`, bodyFormat: 'html', bodyHtml: '<p>PRIVATE_BODY</p>', isPrivate: true },
    })
    check('创建私有笔记成功', ok(priv.status), `实际 ${priv.status}`)
    const privAtt = await upload(admin, 'private.png', 'image/png', PNG, priv.json.id)
    check('上传时可直接绑定到私有笔记', ok(privAtt.status) && privAtt.json?.noteId === priv.json.id)

    check('未被共享的成员看不到私有笔记', [403, 404].includes((await req('GET', `/api/notes/${priv.json.id}`, { token: memberToken })).status))
    check('未被共享的成员下载不到私有笔记附件', [403, 404].includes((await fetch(`${BASE}/api/attachments/${privAtt.json.id}/download`, { headers: { Authorization: `Bearer ${memberToken}` } })).status))
    check('私有笔记正文不出现在他人搜索结果', !ids(await req('GET', '/api/notes?q=PRIVATE_BODY', { token: memberToken })).includes(priv.json.id))

    check('普通成员不能轮换他人附件 token', (await req('POST', `/api/attachments/${att.id}/token`, { token: memberToken })).status === 403)
    check('普通成员不能改他人附件归属', (await req('PUT', `/api/attachments/${att.id}/note`, { token: memberToken, body: { noteId: mdNote.id } })).status === 403)

    const memUp = await upload(memberToken, 'mine.png', 'image/png', PNG)
    check('普通成员可上传附件', ok(memUp.status), `实际 ${memUp.status}`)
    const memNote = await req('POST', '/api/notes', { token: memberToken, body: { title: `成员笔记 ${RUN_ID}`, bodyMd: 'MEMBER_NOTE_BODY' } })
    check('成员可把自己的附件绑到自己的笔记', (await req('PUT', `/api/attachments/${memUp.json.id}/note`, { token: memberToken, body: { noteId: memNote.json.id } })).status === 200)
    check('成员不能把附件绑到无权编辑的他人笔记', (await req('PUT', `/api/attachments/${memUp.json.id}/note`, { token: memberToken, body: { noteId: mdNote.id } })).status === 403)
    check('成员不能把附件绑到无权编辑的私有笔记', (await req('PUT', `/api/attachments/${memUp.json.id}/note`, { token: memberToken, body: { noteId: priv.json.id } })).status === 403)

    const memList = await req('GET', `/api/attachments?noteId=${memNote.json.id}`, { token: memberToken })
    check('成员能按 noteId 列到自己绑定的附件', (memList.json ?? []).some((a) => a.id === memUp.json.id), `返回 ${(memList.json ?? []).length} 条`)
  }

  // ================= F. 富文本插图链路 =================
  group('F. 富文本插图链路（前端实际用法）')
  const imgNote = await req('POST', '/api/notes', {
    token: admin,
    body: {
      title: `带图富文本 ${RUN_ID}`,
      bodyFormat: 'html',
      bodyHtml: `<p>看图</p><img src="/api/attachments/${att.id}/download?t=${newTok}" alt="图">`,
    },
  })
  check('含 token 图片 URL 的笔记可保存', ok(imgNote.status), `实际 ${imgNote.status}`)
  const savedSrc = (imgNote.json?.bodyHtml ?? '').match(/src="([^"]+)"/)?.[1]
  check('img src 同源路径被保留', savedSrc === `/api/attachments/${att.id}/download?t=${newTok}`, savedSrc ?? '被剥离')
  const imgFetch = await fetch(BASE + savedSrc)
  check('笔记里的图片 URL 可被浏览器直接加载', imgFetch.status === 200 && imgFetch.headers.get('content-type') === 'image/png', `实际 ${imgFetch.status}`)
  check('img 保留 alt', /alt="图"/.test(imgNote.json?.bodyHtml ?? ''))
  check('javascript: 图片被消毒', !/javascript:/i.test((await req('POST', '/api/notes', { token: admin, body: { title: 'x', bodyFormat: 'html', bodyHtml: '<img src="javascript:alert(1)">' } })).json?.bodyHtml ?? ''))

  // 中文文件名插图（缺陷 1 的业务影响面）
  const cnNote = await req('POST', '/api/notes', {
    token: admin,
    body: {
      title: `中文名插图 ${RUN_ID}`,
      bodyFormat: 'html',
      bodyHtml: `<img src="/api/attachments/${att.id}/download?t=${newTok}" alt="截图">`,
    },
  })
  const cnSrc = (cnNote.json?.bodyHtml ?? '').match(/src="([^"]+)"/)?.[1]
  const cnLoad = await fetch(BASE + cnSrc)
  check('中文文件名附件在笔记里不表现为破图', cnLoad.status === 200, `实际 ${cnLoad.status}`)

  // ================= 汇总 =================
  const pass = results.filter((r) => r.pass).length
  const fail = results.filter((r) => !r.pass)
  console.log(`\n\x1b[1m========== 汇总 ==========\x1b[0m`)
  console.log(`断言 ${results.length} 项：\x1b[32m通过 ${pass}\x1b[0m，\x1b[31m失败 ${fail.length}\x1b[0m，跳过 ${skipped.length}`)
  if (fail.length) {
    console.log('\n\x1b[31m失败明细：\x1b[0m')
    for (const f of fail) console.log(`  [${f.group}] ${f.name} — ${f.detail}`)
  }
  if (process.env.E2E_RESULT_JSON) {
    fs.writeFileSync(process.env.E2E_RESULT_JSON, JSON.stringify({ results, skipped }, null, 2))
  }
  process.exit(fail.length ? 1 : 0)
}

main().catch((e) => {
  console.error('\n\x1b[31m测试脚本异常中断：\x1b[0m', e)
  process.exit(2)
})
