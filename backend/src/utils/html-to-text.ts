/**
 * 富文本正文的纯文本投影（HTML/Markdown -> 纯文本）。
 *
 * 用途有两个，都是「只要字、不要标记」：
 * 1) 写入时生成 Note.bodyText，供搜索 ILIKE 使用
 *    （直接对 HTML 做 ILIKE 会被标签打断：搜中文命中失效、搜 div 命中全部笔记）
 * 2) iCal DESCRIPTION 直接用它，避免把 HTML 塞进日历
 *
 * 刻意保持「无依赖、纯函数、可单测」——项目测试基建是 node:test + utils/*.test.ts，
 * 依赖 Prisma 的一律不 mock，所以这个文件必须能脱离数据库单测。
 */

/** 块级标签：闭合处补换行，否则整篇正文会塌成一行 */
const BLOCK_CLOSE =
  /<\/(p|div|section|article|h[1-6]|ul|ol|li|blockquote|pre|tr|table|figure|figcaption)\s*>/gi
/** 自闭合/独占标签：出现即补换行 */
const BLOCK_SELF = /<(br|hr)\s*\/?>/gi
/** 整块丢弃（script/style 的**内容**也不能留，否则会进搜索索引） */
const DROP_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
/** 图片不贡献可检索文本（alt 往往是文件名），整体丢弃 */
const IMG_TAG = /<img\b[^>]*>/gi
/** 剩余标签一律剥掉 */
const ANY_TAG = /<[^>]*>/g

/** 只覆盖正文里真正会出现的实体，不做通用解码（避免把 &lt; 之类的写法解成尖括号） */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  copy: '©',
}

/** 解码 HTML 实体：支持命名实体与数字实体（十进制 / 十六进制） */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m
      try {
        return String.fromCodePoint(code)
      } catch {
        return m
      }
    }
    const hit = NAMED_ENTITIES[body.toLowerCase()]
    return hit ?? m
  })
}

/**
 * HTML -> 纯文本。空值返回空串（不返回字符串 "null"）。
 *
 * 净化边界说明：这里做的是「提取可检索文本」，**不是** HTML 消毒。
 * 消毒由 utils/sanitize-note-html.ts 负责，且在写库之前就已执行。
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return decodeEntities(
    html
      .replace(DROP_BLOCK, ' ')
      .replace(IMG_TAG, ' ')
      .replace(BLOCK_CLOSE, '\n')
      .replace(BLOCK_SELF, '\n')
      .replace(ANY_TAG, ''),
  )
    // 先横向折叠（不含换行），再处理换行，否则会先把 \n\n 压掉
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 按正文格式算出 bodyText。
 * markdown -> 原样返回 bodyMd（保留 Markdown 符号，保证升级前后搜索行为逐字节等价）
 * html     -> 从 bodyHtml 提取
 */
export function noteSearchText(format: string, bodyMd: string, bodyHtml: string): string {
  return format === 'html' ? htmlToText(bodyHtml) : bodyMd || ''
}
