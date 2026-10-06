import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { motion } from 'framer-motion'

interface Props {
  editor: Editor
  uploading: boolean
  onPickImage: () => void
}

type Btn = {
  key: string
  title: string
  label: ReactNode
  isActive: () => boolean
  run: () => void
  disabled?: boolean
}

export default function EditorToolbar({ editor, uploading, onPickImage }: Props) {
  const groups: Btn[][] = [
    [
      { key: 'h1', title: '标题 1', label: <b>H1</b>, isActive: () => editor.isActive('heading', { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
      { key: 'h2', title: '标题 2', label: <b>H2</b>, isActive: () => editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { key: 'h3', title: '标题 3', label: <b>H3</b>, isActive: () => editor.isActive('heading', { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    ],
    [
      { key: 'bold', title: '加粗 (Ctrl+B)', label: <b>B</b>, isActive: () => editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { key: 'italic', title: '斜体 (Ctrl+I)', label: <i>I</i>, isActive: () => editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { key: 'strike', title: '删除线', label: <s>S</s>, isActive: () => editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { key: 'code', title: '行内代码', label: <code>&lt;/&gt;</code>, isActive: () => editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { key: 'ul', title: '无序列表', label: '• ≡', isActive: () => editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { key: 'ol', title: '有序列表', label: '1. ≡', isActive: () => editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { key: 'task', title: '任务清单', label: '☑ ≡', isActive: () => editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
      { key: 'quote', title: '引用', label: '❝', isActive: () => editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { key: 'hr', title: '分隔线', label: '—', isActive: () => editor.isActive('horizontalRule'), run: () => editor.chain().focus().setHorizontalRule().run() },
    ],
    [
      {
        key: 'link',
        title: '链接（选中文字后点击；留空可移除）',
        label: '🔗',
        isActive: () => editor.isActive('link'),
        run: () => {
          const prev = (editor.getAttributes('link').href as string) || ''
          const url = window.prompt('链接地址（留空移除链接）', prev)
          if (url === null) return
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        },
      },
      { key: 'image', title: '插入图片', label: '🖼', isActive: () => false, run: onPickImage, disabled: uploading },
    ],
    [
      { key: 'undo', title: '撤销 (Ctrl+Z)', label: '↶', isActive: () => false, run: () => editor.chain().focus().undo().run() },
      { key: 'redo', title: '重做 (Ctrl+Shift+Z)', label: '↷', isActive: () => false, run: () => editor.chain().focus().redo().run() },
    ],
  ]

  return (
    <div className="rt-toolbar">
      {groups.map((group, gi) => (
        <div className="rt-group" key={gi}>
          {group.map((b) => (
            <motion.button
              key={b.key}
              type="button"
              title={b.title}
              disabled={b.disabled}
              whileTap={{ scale: b.disabled ? 1 : 0.88 }}
              className={'rt-btn' + (b.isActive() ? ' is-active' : '')}
              // 必须用 onMouseDown + preventDefault：否则点击会抢走编辑区焦点，
              // 导致「连点两次加粗第二次没反应」
              onMouseDown={(e) => {
                e.preventDefault()
                if (b.disabled) return
                b.run()
              }}
            >
              {b.label}
            </motion.button>
          ))}
        </div>
      ))}
      {uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12, color: 'var(--primary)' }}>
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}>⟳</motion.span>
          上传中…
        </div>
      )}
    </div>
  )
}
