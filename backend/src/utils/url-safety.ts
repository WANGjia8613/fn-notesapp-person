/**
 * LLM Base URL 安全校验（防 SSRF）。
 *
 * 本项目部署在私有 NAS，且明确支持内网/本地 LLM（如 Ollama，
 * 地址常为 http://192.168.x.x:11434/v1 或 http://host.docker.internal:11434/v1），
 * 因此不能一刀切禁止私网地址。这里只拦截：
 *   1. 非 http/https 协议（file://、gopher://、dict:// 等）
 *   2. 云实例元数据/链路本地地址 169.254.0.0/16（SSRF 窃取凭证的主要目标）
 *   3. 0.0.0.0 与 IPv6 链路本地 fe80::/10、IPv4 映射的元数据地址
 *
 * 普通私网段（127/10/172.16/192.168）放行，以支持本地模型。
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
 * 校验 LLM baseUrl 是否安全。
 * @returns 安全返回 null；不安全返回错误说明。
 */
export function checkLLMBaseUrl(rawUrl: string): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return 'Base URL 格式无效'
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return 'Base URL 仅支持 http/https 协议'
  }

  // 去掉端口，得到主机名；IPv6 在 URL 里带 []
  let host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  // 0.0.0.0
  if (host === '0.0.0.0' || host === '::') {
    return '不允许使用 0.0.0.0 作为目标地址'
  }

  // IPv6 链路本地 fe80::/10
  if (host.startsWith('fe80') || host.startsWith('fe90') || host.startsWith('fea0') || host.startsWith('feb0')) {
    return '不允许指向 IPv6 链路本地地址'
  }

  // IPv4 映射的 IPv6（如 ::ffff:169.254.169.254）
  const v4Mapped = host.match(/(?:\d{1,3}\.){3}\d{1,3}$/)
  if (v4Mapped) host = v4Mapped[0]

  // 云元数据 / 链路本地
  if (isLinkLocalV4(host)) {
    return '不允许指向 169.254.x.x 链路本地/云元数据地址'
  }

  return null
}
