import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeNoteHtml } from './sanitize-note-html.js'

// ===== 恶意输入必须被剥离 =====

test('剥离 script 标签及其内容', () => {
  assert.equal(sanitizeNoteHtml('<p>ok</p><script>alert(1)</script>'), '<p>ok</p>')
})

test('剥离事件处理器属性', () => {
  assert.equal(sanitizeNoteHtml('<p onclick="alert(1)">x</p>'), '<p>x</p>')
  // 注意：sanitize-html 按 XHTML 风格序列化为自闭合形式 <img ... />
  assert.equal(
    sanitizeNoteHtml('<img src="/api/attachments/a/download" onerror="alert(1)">'),
    '<img src="/api/attachments/a/download" />',
  )
})

test('拒绝 javascript: 图片来源，降级为 span', () => {
  const out = sanitizeNoteHtml('<img src="javascript:alert(1)">')
  assert.ok(!out.includes('javascript:'))
})

test('剥离 iframe / object 等危险容器', () => {
  assert.equal(sanitizeNoteHtml('<iframe src="https://evil.com"></iframe>'), '')
  assert.equal(sanitizeNoteHtml('<p>a</p><object data="x"></object><p>b</p>'), '<p>a</p><p>b</p>')
})

test('剥离 style 标签及其内容', () => {
  const out = sanitizeNoteHtml('<style>body{display:none}</style><p>x</p>')
  assert.ok(!out.includes('display:none'))
  assert.ok(out.includes('<p>x</p>'))
})

test('javascript: 链接被剥掉 href', () => {
  const out = sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>')
  assert.ok(!out.includes('javascript:'))
})

// ===== 合法富文本必须被保留（对称断言：防止净化过度）=====

test('放行任务清单所需的 input/label/data-type', () => {
  const out = sanitizeNoteHtml(
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">' +
      '<label><input type="checkbox" checked></label><div><p>done</p></div></li></ul>',
  )
  assert.ok(out.includes('data-type="taskList"'))
  assert.ok(out.includes('data-checked="true"'))
  assert.ok(out.includes('<input type="checkbox"'))
  assert.ok(out.includes('<p>done</p>'))
})

test('保留代码块 language-* 类名（mermaid 兼容）', () => {
  assert.ok(
    sanitizeNoteHtml('<pre><code class="language-mermaid">graph TD;</code></pre>').includes(
      'language-mermaid',
    ),
  )
})

test('放行同源附件路径与 https 图片', () => {
  assert.ok(
    sanitizeNoteHtml('<img src="/api/attachments/abc/download?t=deadbeef">').includes(
      '/api/attachments/',
    ),
  )
  assert.ok(
    sanitizeNoteHtml('<img src="https://example.com/a.png">').includes('https://example.com/a.png'),
  )
})

test('外链强制 rel=noopener noreferrer nofollow + target=_blank', () => {
  const out = sanitizeNoteHtml('<a href="https://example.com">x</a>')
  assert.ok(out.includes('noopener'))
  assert.ok(out.includes('noreferrer'))
  assert.ok(out.includes('_blank'))
})

test('放行基础排版标签全集', () => {
  const src =
    '<h1>标题</h1><h2>二</h2><h3>三</h3>' +
    '<p><strong>粗</strong><em>斜</em><s>删</s><code>行内</code></p>' +
    '<ul><li>甲</li></ul><ol><li>乙</li></ol><blockquote>引用</blockquote><hr><pre><code>块</code></pre>'
  const out = sanitizeNoteHtml(src)
  for (const tag of [
    '<h1>',
    '<h3>',
    '<strong>',
    '<em>',
    '<s>',
    '<code>',
    '<ul>',
    '<ol>',
    '<blockquote>',
    '<hr />', // sanitize-html 序列化为自闭合形式
    '<pre>',
  ]) {
    assert.ok(out.includes(tag), `标签被误删: ${tag} —— 实际输出: ${out}`)
  }
})

test('img 保留 alt 与尺寸属性', () => {
  const out = sanitizeNoteHtml('<img src="https://e.com/a.png" alt="说明" width="200">')
  assert.ok(out.includes('alt="说明"'))
  assert.ok(out.includes('width="200"'))
})

test('空值返回空串', () => {
  assert.equal(sanitizeNoteHtml(null), '')
  assert.equal(sanitizeNoteHtml(undefined), '')
  assert.equal(sanitizeNoteHtml(''), '')
})
