/**
 * 构造 Content-Disposition 响应头。
 *
 * 为什么需要单独抽出来：Node 的 `setHeader` 只接受 latin1 字符，
 * 直接把中文文件名塞进 `filename="..."` 会抛 ERR_INVALID_CHAR，
 * 整个下载请求变成 500 —— 附件（以及富文本笔记里的插图）彻底打不开。
 *
 * 解法是 RFC 6266 / RFC 5987 的标准组合：
 * - `filename="<ASCII 回退名>"`：给不认 filename* 的老客户端，必须纯 latin1；
 * - `filename*=UTF-8''<percent-encoded>`：真实文件名，现代浏览器优先使用。
 */

/** 清掉可能破坏头结构的字符（裸引号、反斜杠、CR/LF） */
function safeFilename(name: string): string {
  return (name || 'attachment').replace(/[\r\n"\\]/g, '_').slice(0, 200)
}

/**
 * 生成只含 ASCII 的回退文件名，尽量保留扩展名。
 * 非 ASCII 字符统一替换为 `_`；若替换后主干为空（如「图.png」→「_.png」），
 * 退化为 `attachment` + 原扩展名，避免出现 `filename="_.png"` 这种无意义结果。
 */
function asciiFallback(name: string): string {
  const safe = safeFilename(name)
  const dot = safe.lastIndexOf('.')
  const ext = dot > 0 ? safe.slice(dot).replace(/[^\x20-\x7e]/g, '') : ''
  const stem = (dot > 0 ? safe.slice(0, dot) : safe).replace(/[^\x20-\x7e]/g, '_')
  const cleaned = stem.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '')
  return (cleaned || 'attachment') + ext
}

/**
 * @param filename 原始文件名（可能含中文/emoji）
 * @param inline   true = `inline`（白名单图片直接在浏览器渲染），false = `attachment`（强制下载）
 */
export function buildContentDisposition(filename: string, inline: boolean): string {
  const safe = safeFilename(filename)
  return (
    `${inline ? 'inline' : 'attachment'}; ` +
    `filename="${asciiFallback(safe)}"; ` +
    `filename*=UTF-8''${encodeURIComponent(safe)}`
  )
}
