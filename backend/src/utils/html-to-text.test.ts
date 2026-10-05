import test from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, decodeEntities, noteSearchText } from './html-to-text.js'

test('剥掉标签保留文字', () => {
  assert.equal(htmlToText('<p>你好<strong>世界</strong></p>'), '你好世界')
})

test('块级元素闭合处换行，不会塌成一行', () => {
  assert.equal(htmlToText('<p>一</p><p>二</p>'), '一\n二')
  assert.equal(htmlToText('<h1>标题</h1><ul><li>甲</li><li>乙</li></ul>'), '标题\n甲\n乙')
  assert.equal(htmlToText('上<br>下'), '上\n下')
})

test('script/style 连内容一起丢弃，不进搜索索引', () => {
  assert.equal(htmlToText('<p>正文</p><script>alert(1)</script>'), '正文')
  assert.equal(htmlToText('<style>.a{color:red}</style><p>正文</p>'), '正文')
})

test('img 整体丢弃，alt 不进正文', () => {
  assert.equal(
    htmlToText('<p><img src="/api/attachments/x/download?t=y" alt="图.png">说明</p>'),
    '说明',
  )
})

test('实体解码，含数字与十六进制', () => {
  assert.equal(htmlToText('a &amp; b'), 'a & b')
  assert.equal(htmlToText('&lt;div&gt;'), '<div>')
  assert.equal(htmlToText('&#65;&#x42;'), 'AB')
  assert.equal(htmlToText('&nbsp;x'), 'x') // 解码成空格后被 trim 收掉
  assert.equal(htmlToText('a&nbsp;b'), 'a b') // 词内则保留为分隔符
})

test('未知实体原样保留，不吞掉', () => {
  assert.equal(htmlToText('&nosuchentity;'), '&nosuchentity;')
  assert.equal(htmlToText('&#xZZ;'), '&#xZZ;')
})

test('折叠多余空白与空行', () => {
  assert.equal(htmlToText('<p>a</p>\n\n\n<p>b</p>'), 'a\n\nb')
  assert.equal(htmlToText('<p>  a   b  </p>'), 'a b')
  assert.equal(htmlToText('   <p>x</p>   '), 'x')
})

test('保留换行结构但收敛到最多两个连续换行', () => {
  assert.equal(htmlToText('<p>a</p><p></p><p></p><p>b</p>'), 'a\n\nb')
})

test('空值返回空串，不返回 "null"', () => {
  assert.equal(htmlToText(null), '')
  assert.equal(htmlToText(undefined), '')
  assert.equal(htmlToText(''), '')
})

test('script 标签未闭合时也不会吃掉后续正文', () => {
  // 病态输入的兜底：宁可残留标签文本，也不能整篇丢光
  assert.ok(htmlToText('<p>正文</p><script>x').includes('正文'))
})

test('noteSearchText：markdown 原样返回，html 走提取', () => {
  // markdown 必须逐字节原样返回 —— 这是「升级前后搜索行为等价」的基础
  assert.equal(noteSearchText('markdown', '# 标题\n正文', ''), '# 标题\n正文')
  assert.equal(noteSearchText('html', '', '<h1>标题</h1><p>正文</p>'), '标题\n正文')
  assert.equal(noteSearchText('html', '会被忽略', '<p>正文</p>'), '正文')
})

test('decodeEntities 结果仍是纯文本语义', () => {
  assert.equal(decodeEntities('&lt;script&gt;'), '<script>')
})
