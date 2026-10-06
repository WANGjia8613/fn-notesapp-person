import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContentDisposition } from './content-disposition.js'

/**
 * 回归测试：中文（及任何非 ASCII）文件名的附件下载返回 500。
 *
 * 根因：Content-Disposition 的 filename="..." 参数直接塞进原始 UTF-8 文件名，
 * Node 的 setHeader 只接受 latin1，遇到中文字符抛 ERR_INVALID_CHAR，
 * 请求变成 500，附件完全下载不了（token 路径与 JWT 路径都一样）。
 *
 * 正确做法：filename 参数只放 ASCII 安全回退名，真实中文名交给
 * RFC 5987 的 filename*=UTF-8''<percent-encoded>，浏览器优先用后者。
 */

test('纯 ASCII 文件名：filename 与 filename* 都保留原名', () => {
  const h = buildContentDisposition('report.pdf', false)
  assert.match(h, /^attachment; /)
  assert.match(h, /filename="report\.pdf"/)
  assert.match(h, /filename\*=UTF-8''report\.pdf/)
})

test('中文文件名：生成的头必须是纯 latin1，不含任何非 ASCII 字节', () => {
  const h = buildContentDisposition('测试图片.png', true)
  // 这是会触发 ERR_INVALID_CHAR 的直接条件
  for (const ch of h) {
    assert.ok(ch.charCodeAt(0) <= 0xff, `头里出现了非 latin1 字符: ${JSON.stringify(ch)}`)
  }
  assert.match(h, /^inline; /)
})

test('中文文件名：filename* 用百分号编码保留原名，浏览器能还原', () => {
  const h = buildContentDisposition('测试图片.png', true)
  assert.match(h, /filename\*=UTF-8''%E6%B5%8B%E8%AF%95%E5%9B%BE%E7%89%87\.png/)
  assert.equal(decodeURIComponent(h.split("filename*=UTF-8''")[1]), '测试图片.png')
})

test('中文文件名：ASCII 回退名保留扩展名，不把非 ASCII 变成空串', () => {
  const h = buildContentDisposition('测试图片.png', true)
  const fallback = /filename="([^"]*)"/.exec(h)?.[1]
  assert.ok(fallback && fallback.length > 0, '回退名不能为空')
  assert.match(fallback, /\.png$/, `回退名应保留扩展名，实际 ${fallback}`)
})

test('emoji / 混合文件名同样安全', () => {
  const h = buildContentDisposition('设计稿 🎨 v2.png', false)
  for (const ch of h) assert.ok(ch.charCodeAt(0) <= 0xff)
  assert.match(h, /filename\*=UTF-8''/)
})

test('文件名里的引号、反斜杠、换行不会破坏头结构', () => {
  const h = buildContentDisposition('a"b\\c\r\nd.png', false)
  assert.equal(h.split('"').length - 1, 2, '只应有一对包裹回退名的引号')
  assert.ok(!/[\r\n]/.test(h), '头里不能有裸换行')
})

test('空文件名回退为 attachment，不产生 filename=""', () => {
  const h = buildContentDisposition('', false)
  assert.match(h, /filename="attachment"/)
})

test('inline / attachment 由第二参数决定', () => {
  assert.match(buildContentDisposition('a.png', true), /^inline; /)
  assert.match(buildContentDisposition('a.png', false), /^attachment; /)
})
