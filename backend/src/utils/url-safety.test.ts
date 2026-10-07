import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkOutboundUrl } from './url-safety.js'

/**
 * 出站地址 SSRF 校验的回归测试。
 *
 * 这个文件存在的原因：本项目部署在个人 NAS 上，**必须**支持内网地址
 * （本地 Ollama 常是 http://192.168.x.x:11434/v1），所以校验不是「禁止私网」，
 * 而是「放行私网、只掐掉真正危险的那几个」——这个边界很容易在后续修改中
 * 被改坏（要么误杀内网模型地址，要么漏放元数据地址），因此把两边都钉住。
 */

// ---- 必须放行：本地 / 内网 / 公网 ----

test('放行公网 https 地址', () => {
  assert.equal(checkOutboundUrl('https://api.openai.com/v1'), null)
})

test('放行内网地址：本地 Ollama 是本项目的一等公民场景', () => {
  assert.equal(checkOutboundUrl('http://192.168.1.10:11434/v1'), null)
  assert.equal(checkOutboundUrl('http://10.0.0.5:8080/hook'), null)
  assert.equal(checkOutboundUrl('http://172.16.3.4:9000'), null)
})

test('放行 loopback 与 docker 宿主机别名', () => {
  assert.equal(checkOutboundUrl('http://127.0.0.1:11434/v1'), null)
  assert.equal(checkOutboundUrl('http://localhost:3000'), null)
  assert.equal(checkOutboundUrl('http://host.docker.internal:11434/v1'), null)
})

// ---- 必须拦截 ----

test('拦截非 http/https 协议（file / gopher 等）', () => {
  assert.match(checkOutboundUrl('file:///etc/passwd') ?? '', /协议/)
  assert.match(checkOutboundUrl('gopher://127.0.0.1:6379/_INFO') ?? '', /协议/)
  assert.match(checkOutboundUrl('dict://127.0.0.1:11211/stat') ?? '', /协议/)
})

test('拦截云元数据地址 169.254.169.254', () => {
  // SSRF 最经典的目标：拿到云主机的临时凭证
  assert.match(checkOutboundUrl('http://169.254.169.254/latest/meta-data/') ?? '', /169\.254/)
})

test('拦截 169.254.0.0/16 整个链路本地段', () => {
  assert.match(checkOutboundUrl('http://169.254.1.1/') ?? '', /169\.254/)
  assert.match(checkOutboundUrl('http://169.254.255.254/') ?? '', /169\.254/)
})

test('拦截 IPv6 链路本地 fe80::/10（含 fe81 / febf 边界）', () => {
  // 回归：早期实现写成 startsWith('fe80')，只能挡住 fe80 开头，
  // 而 fe80::/10 实际覆盖 fe80~febf，fe81::1 这类会直接漏过去。
  assert.match(checkOutboundUrl('http://[fe80::1]/') ?? '', /链路本地/)
  assert.match(checkOutboundUrl('http://[fe81::1]/') ?? '', /链路本地/)
  assert.match(checkOutboundUrl('http://[febf::1]/') ?? '', /链路本地/)
})

test('fec0 及全球单播地址不误杀', () => {
  // fec0::/10 是已废弃的站点本地段，不属于链路本地，按放行私网的一贯口径放行
  assert.equal(checkOutboundUrl('http://[fec0::1]/'), null)
  assert.equal(checkOutboundUrl('http://[2001:db8::1]/'), null)
  // ::1 与 127.0.0.1 同等对待（本机服务要能用）
  assert.equal(checkOutboundUrl('http://[::1]:11434/v1'), null)
})

test('拦截 IPv4 映射形式的元数据地址 ::ffff:169.254.169.254', () => {
  // 绕过手法：主机名写成 IPv6 形式。Node 的 URL 解析器会把它规范化成
  // ::ffff:a9fe:a9fe，所以只匹配「结尾的点分十进制」是抓不到的，必须拆 hextet。
  assert.match(checkOutboundUrl('http://[::ffff:169.254.169.254]/') ?? '', /169\.254/)
  assert.match(checkOutboundUrl('http://[0:0:0:0:0:ffff:169.254.169.254]/') ?? '', /169\.254/)
})

test('拦截 IPv4 兼容写法 ::169.254.169.254', () => {
  assert.match(checkOutboundUrl('http://[::169.254.169.254]/') ?? '', /169\.254/)
})

test('映射写法指向内网/Ollama 时不误杀', () => {
  // 防的是「只要是 ::ffff: 就一律拦」的粗糙实现
  assert.equal(checkOutboundUrl('http://[::ffff:127.0.0.1]:11434/v1'), null)
  assert.equal(checkOutboundUrl('http://[::ffff:192.168.1.10]:11434/v1'), null)
})

test('拦截 0.0.0.0', () => {
  assert.match(checkOutboundUrl('http://0.0.0.0:8080/') ?? '', /0\.0\.0\.0/)
})

test('格式非法的地址返回错误而不是抛异常', () => {
  // 调用方是路由，抛异常会变成 500；这里必须返回可展示的字符串
  assert.match(checkOutboundUrl('not-a-url') ?? '', /格式/)
  assert.match(checkOutboundUrl('') ?? '', /格式/)
})

// ---- 边界：别把正常地址误杀 ----

test('169 或 254 出现在其它位置时不误杀', () => {
  // 防的是「看到 169 或 254 就拦」的粗糙实现
  assert.equal(checkOutboundUrl('http://169.253.0.1/'), null)
  assert.equal(checkOutboundUrl('http://168.254.0.1/'), null)
  assert.equal(checkOutboundUrl('http://192.168.1.169/'), null)
})

test('带路径与查询串的 webhook 地址正常放行', () => {
  assert.equal(
    checkOutboundUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc-123?x=1'),
    null,
  )
})
