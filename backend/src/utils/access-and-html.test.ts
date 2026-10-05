import test from 'node:test'
import assert from 'node:assert/strict'
import {
  seesAllNotes,
  noteVisibilityWhere,
  canViewNote,
  canEditNote,
  canDeleteNote,
  type Actor,
} from './note-access.js'
import { escapeHtml, escapeTags } from './html.js'

const owner: Actor = { userId: 'u-owner', workspaceId: 'w1', role: 'owner' }
const admin: Actor = { userId: 'u-admin', workspaceId: 'w1', role: 'admin' }
const author: Actor = { userId: 'u-author', workspaceId: 'w1', role: 'member' }
const other: Actor = { userId: 'u-other', workspaceId: 'w1', role: 'member' }
const shared: Actor = { userId: 'u-shared', workspaceId: 'w1', role: 'member' }

// ========== 可见性 ==========

test('公开笔记：团队内所有成员可见', () => {
  const note = { authorId: 'u-author', isPrivate: false }
  assert.equal(canViewNote(note, author), true)
  assert.equal(canViewNote(note, other), true)
  assert.equal(canViewNote(note, admin), true)
  assert.equal(canViewNote(note, owner), true)
})

test('私有笔记：仅作者 + 被共享成员可见', () => {
  const note = { authorId: 'u-author', isPrivate: true, members: [{ userId: 'u-shared' }] }
  assert.equal(canViewNote(note, author), true, '作者应可见')
  assert.equal(canViewNote(note, shared), true, '被共享成员应可见')
  assert.equal(canViewNote(note, other), false, '无关成员不应可见')
  assert.equal(canViewNote(note, admin), false, 'admin 不自动获得私有笔记可见性')
  assert.equal(canViewNote(note, owner), true, 'owner 可见全部')
})

test('私有笔记 members 缺失时不应抛错，且除作者/owner 外不可见', () => {
  const note = { authorId: 'u-author', isPrivate: true }
  assert.equal(canViewNote(note, other), false)
  assert.equal(canViewNote(note, author), true)
})

test('seesAllNotes 只对 owner 为真', () => {
  assert.equal(seesAllNotes(owner), true)
  assert.equal(seesAllNotes(admin), false)
  assert.equal(seesAllNotes(author), false)
})

test('noteVisibilityWhere：owner 不加限制，其他角色按公开+本人+被共享过滤', () => {
  assert.deepEqual(noteVisibilityWhere(owner), {})
  const w = noteVisibilityWhere(other) as { OR: unknown[] }
  assert.equal(Array.isArray(w.OR), true)
  assert.equal(w.OR.length, 3)
})

// ========== 编辑 / 删除权限 ==========

test('canEditNote：作者本人或 owner/admin', () => {
  const note = { authorId: 'u-author' }
  assert.equal(canEditNote(note, author), true)
  assert.equal(canEditNote(note, admin), true)
  assert.equal(canEditNote(note, owner), true)
  assert.equal(canEditNote(note, other), false)
})

test('canDeleteNote：仅作者本人或 owner（admin 不可删）', () => {
  const note = { authorId: 'u-author' }
  assert.equal(canDeleteNote(note, author), true)
  assert.equal(canDeleteNote(note, owner), true)
  assert.equal(canDeleteNote(note, admin), false, 'admin 不应能删除他人笔记')
  assert.equal(canDeleteNote(note, other), false)
})

// ========== HTML 转义（邮件防注入） ==========

test('escapeHtml 转义全部五个危险字符', () => {
  assert.equal(escapeHtml(`<script>alert("x&y")</script>`), '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;')
  assert.equal(escapeHtml("it's"), 'it&#39;s')
})

test('escapeHtml 对 null/undefined 返回空串而不是字符串 "null"', () => {
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('escapeHtml 对数字等非字符串输入不抛错', () => {
  assert.equal(escapeHtml(123), '123')
  assert.equal(escapeHtml(0), '0')
})

test('escapeTags 输出转义后的 #tag 列表，非数组输入返回空串', () => {
  // 输入含 < 和 >，验证两个方向都被转义
  assert.equal(escapeTags(['工作', 'a<b>c']), '#工作 #a&lt;b&gt;c')
  assert.equal(escapeTags(['plain']), '#plain')
  assert.equal(escapeTags([]), '')
  assert.equal(escapeTags('not-an-array'), '')
  assert.equal(escapeTags(null), '')
})
