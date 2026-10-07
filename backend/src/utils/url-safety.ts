/**
 * 出站 URL 安全校验（防 SSRF）。
 *
 * 适用于**所有由用户填写、服务端会主动去请求**的地址：
 * LLM baseUrl、Webhook 推送地址等。任何新增的这类入口都应当调用本文件的校验，
 * 不要只在其中一个入口做——之前就漏过 webhook，导致普通成员也能让服务器去打内网。
 *
 * 本项目部署在私有 NAS，且明确支持内网/本地服务（如 Ollama，
 * 地址常为 http://192.168.x.x:11434/v1 或 http://host.docker.internal:11434/v1），
 * 因此不能一刀切禁止私网地址。这里只拦截：
 *   1. 非 http/https 协议（file://、gopher://、dict:// 等）
 *   2. 云实例元数据/链路本地地址 169.254.0.0/16（SSRF 窃取凭证的主要目标）
 *   3. 0.0.0.0 与 IPv6 链路本地 fe80::/10、IPv4 映射的元数据地址
 *
 * 普通私网段（127/10/172.16/192.168）放行，以支持本地模型与内网服务。
 *
 * 已知残余风险（本文件不解决）：校验发生在**写入配置时**，请求时才做 DNS 解析，
 * 因此存在 DNS rebinding 的窗口——攻击者让域名先解析到公网 IP 通过校验，
 * 之后再解析到 169.254.169.254。彻底修法是在请求前解析并把连接 pin 到校验过的 IP
 * （自定义 agent + servername），代价较高。考虑到本项目的部署形态是个人 NAS、
 * 地址由使用者自己填写，这里只做写入时校验并把风险写明，不引入那套复杂度。
 */

/** 判断字符串是否为 169.254.0.0/16（含云元数据 169.254.169.254） */
function isLinkLocalV4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const octets = [m[1], m[2], m[3], m[4]].map(Number)
  if (octets.some((o) => o > 255)) return false
  return octets[0] === 169 && octets[1] === 254
}

/**
 * 把 IPv6 地址展开成 8 个 16 位 hextet（数值数组）。无法解析时返回 null。
 *
 * 展开后的形式才好做前缀判断——直接对字符串做 startsWith 是靠不住的：
 * fe80::/10 覆盖 fe80~febf，而 startsWith('fe80') 连 fe81::1 都匹配不到。
 */
function expandIpv6(host: string): number[] | null {
  if (!host.includes(':')) return null

  const halves = host.split('::')
  if (halves.length > 2) return null

  const parseGroups = (s: string): number[] =>
    s === '' ? [] : s.split(':').map((g) => parseInt(g, 16))

  const head = parseGroups(halves[0] ?? '')
  const tail = halves.length === 2 ? parseGroups(halves[1] ?? '') : head

  let groups: number[]
  if (halves.length === 1) {
    // 没有 ::，必须是完整的 8 段
    if (head.length !== 8) return null
    groups = head
  } else {
    // 把 :: 替换成足够多的 0 段，凑满 8 段
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array<number>(missing).fill(0), ...tail]
  }

  if (groups.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null
  return groups
}

/**
 * 若该 IPv6 地址实际承载的是 IPv4（映射 / 兼容写法），还原成点分十进制。
 *
 * Node 的 WHATWG URL 解析器会把 ::ffff:169.254.169.254 **规范化**成
 * ::ffff:a9fe:a9fe —— 尾部不再有点分十进制，靠「匹配结尾的 1.2.3.4」是抓不到的，
 * 必须把最后两个 hextet 拆回 4 个字节。这正是绕过校验的常用写法。
 *
 * 覆盖 ::ffff:a:b（IPv4-mapped）与 ::a:b（IPv4-compatible）两种；
 * NAT64 前缀（64:ff9b::/96）不在本项目的使用场景内，暂不处理。
 */
function mappedV4(host: string): string | null {
  const g = expandIpv6(host)
  if (!g || g.length !== 8) return null

  const isV4Carrier = g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0x0000)
  if (!isV4Carrier) return null

  const hi = g[6]
  const lo = g[7]
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

/**
 * 校验一个出站目标地址是否安全。
 * @returns 安全返回 null；不安全返回错误说明（可直接回给前端展示）。
 */
export function checkOutboundUrl(rawUrl: string): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return '地址格式无效'
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return '仅支持 http/https 协议'
  }

  // 去掉端口，得到主机名；IPv6 在 URL 里带 []
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  // 0.0.0.0
  if (host === '0.0.0.0' || host === '::') {
    return '不允许使用 0.0.0.0 作为目标地址'
  }

  // IPv6 链路本地 fe80::/10：按首个 hextet 的数值区间判断（0xfe80~0xfebf），
  // 不能写成 startsWith —— 那样连 fe81::1 都会漏掉。
  const groups = expandIpv6(host)
  if (groups && groups[0] >= 0xfe80 && groups[0] <= 0xfebf) {
    return '不允许指向 IPv6 链路本地地址'
  }

  // IPv4 映射/兼容的 IPv6（如 ::ffff:169.254.169.254，规范化后为 ::ffff:a9fe:a9fe）
  const mapped = mappedV4(host)
  if (mapped && isLinkLocalV4(mapped)) {
    return '不允许指向 169.254.x.x 链路本地/云元数据地址'
  }

  // 兜底：少数解析器不做规范化，主机名里可能直接带着点分十进制尾巴
  const v4Tail = host.match(/(?:\d{1,3}\.){3}\d{1,3}$/)
  if (v4Tail && isLinkLocalV4(v4Tail[0])) {
    return '不允许指向 169.254.x.x 链路本地/云元数据地址'
  }

  // 云元数据 / 链路本地
  if (isLinkLocalV4(host)) {
    return '不允许指向 169.254.x.x 链路本地/云元数据地址'
  }

  return null
}
