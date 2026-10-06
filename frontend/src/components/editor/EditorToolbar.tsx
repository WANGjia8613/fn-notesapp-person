import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'

interface Props {
  editor: Editor
  uploading: boolean
  onPickImage: () => void
  /** SVG 不在服务端 INLINE_SAFE_MIME 白名单内，插入后会加载失败，这里提前拦一次 */
  onUnsupportedImage?: () => void
}

type Btn = {
  key: string
  title: string
  /** 用 ReactNode 而非 dangerouslySetInnerHTML：完全避免注入面 */
  label: ReactNode
  isActive: () => boolean
  run: () => void
  disabled?: boolean
}

export default function EditorToolbar({ editor, uploading, onPickImage, onUnsupportedImage }: Props) {
  const groups: Btn[][] = [
    [
      {
        key: 'h1',
        title: '标题 1',
        label: <b>H1</b>,
        isActive: () => editor.isActive('heading', { level: 1 }),
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        key: 'h2',
        title: '标题 2',
        label: <b>H2</b>,
        isActive: () => editor.isActive('heading', { level: 2 }),
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        key: 'h3',
        title: '标题 3',
        label: <b>H3</b>,
        isActive: () => editor.isActive('heading', { level: 3 }),
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        key: 'bold',
        title: '加粗 (Ctrl+B)',
        label: <b>B</b>,
        isActive: () => editor.isActive('bold'),
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        key: 'italic',
        title: '斜体 (Ctrl+I)',
        label: <i>I</i>,
        isActive: () => editor.isActive('italic'),
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        key: 'strike',
        title: '删除线',
        label: <s>S</s>,
        isActive: () => editor.isActive('strike'),
        run: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        key: 'code',
        title: '行内代码',
        label: <code>&lt;/&gt;</code>,
        isActive: () => editor.isActive('code'),
        run: () => editor.chain().focus().toggleCode().run(),
      },
    ],
    [
      {
        key: 'ul',
        title: '无序列表',
        label: '• ≡',
        isActive: () => editor.isActive('bulletList'),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        key: 'ol',
        title: '有序列表',
        label: '1. ≡',
        isActive: () => editor.isActive('orderedList'),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        key: 'task',
        title: '任务清单',
        label: '☑ ≡',
        isActive: () => editor.isActive('taskList'),
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        key: 'quote',
        title: '引用',
        label: '❝',
        isActive: () => editor.isActive('blockquote'),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        key: 'hr',
        title: '分隔线',
        label: '—',
        isActive: () => editor.isActive('horizontalRule'),
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
    [
      {
        key: 'link',
        title: '链接（选中文字后点击；留空可移除）',
        label: '🔗',
        isActive: () => editor.isActive('link'),
        run: () => {
          // 不引UI 库，用原生 prompt（项目已有 window.confirm 先例）
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
      {
        key: 'image',
        title: '插入图片',
        label: '🖼',
        isActive: () => false,
        run: onPickImage,
        disabled: uploading,
      },
    ],
    [
      {
        key: 'undo',
        title: '撤销 (Ctrl+Z)',
        label: '↶',
        isActive: () => false,
        run: () => editor.chain().focus().undo().run(),
      },
      {
        key: 'redo',
        title: '重做 (Ctrl+Shift+Z)',
        label: '↷',
        isActive: () => false,
        run: () => editor.chain().focus().redo().run(),
      },
    ],
  ]

  return (
    <div className="rt-toolbar">
      {groups.map((group, gi) => (
        <div className="rt-group" key={gi}>
          {group.map((b) => (
            <button
              key={b.key}
              type="button"
              title={b.title}
              disabled={b.disabled}
              className={'rt-btn' + (b.isActive() ? ' is-active' : '')}
              // 必须用 onMouseDown + preventDefault：
              // 否则点击按钮会抢走编辑区焦点，导致「连点两次加粗第二次没反应」
              // —— 这是自研富文本编辑器最常见的交互 bug。
              onMouseDown={(e) => {
                e.preventDefault()
                if (b.key === 'image' && onUnsupportedImage) {
                  onUnsupportedImage()
                  return
                }
                b.run()
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
