/**
 * 笔记可见性 / 可写性判定 —— 全后端唯一口径。
 *
 * 规则（与设计文档 §5.2 一致）：
 * - 公开笔记：团队内所有成员可见
 * - 私有笔记：仅 作者本人 + note_members 中列出的共享成员 可见
 * - owner：作为团队创始人可查看/管理全部笔记
 * - 编辑：作者本人，或 owner / admin
 * - 删除：作者本人，或 owner
 */

export interface Actor {
  userId: string
  workspaceId: string
  role: string
}

export interface NoteLike {
  authorId: string
  isPrivate: boolean
  members?: { userId: string }[]
}

/** owner 拥有全量可见性 */
export function seesAllNotes(actor: Actor): boolean {
  return actor.role === 'owner'
}

/**
 * 生成 Prisma where 片段，用于列表 / 搜索 / 日历 / 汇总等批量查询。
 * owner 返回 {}（不加限制）；其他角色按公开+本人+被共享过滤。
 */
export function noteVisibilityWhere(actor: Actor): Record<string, unknown> {
  if (seesAllNotes(actor)) return {}
  return {
    OR: [
      { isPrivate: false },
      { authorId: actor.userId },
      { members: { some: { userId: actor.userId } } },
    ],
  }
}

/** 单条笔记是否可见 */
export function canViewNote(note: NoteLike, actor: Actor): boolean {
  if (!note.isPrivate) return true
  if (seesAllNotes(actor)) return true
  if (note.authorId === actor.userId) return true
  return Boolean(note.members?.some((m) => m.userId === actor.userId))
}

/** 是否可编辑（覆盖保存） */
export function canEditNote(note: Pick<NoteLike, 'authorId'>, actor: Actor): boolean {
  return note.authorId === actor.userId || ['owner', 'admin'].includes(actor.role)
}

/** 是否可删除 */
export function canDeleteNote(note: Pick<NoteLike, 'authorId'>, actor: Actor): boolean {
  return note.authorId === actor.userId || actor.role === 'owner'
}
