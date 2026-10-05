import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import ImageExt from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/core'
import EditorToolbar from './editor/EditorToolbar'
import { useImageUpload } from './editor/useImageUpload'

/**
 * 初始内容的三级兜底：JSON 优先 → HTML 兜底 → 空文档。
 *
 * JSON 优先是「JSON 是编辑真源」这条决策的落地点：JSON 存在时能100% 还原
 * 列表层级、标题层级、任务清单勾选状态；只有 JSON 缺失（数据异常，
 * 或正文由其它客户端写入）才退回 HTML 解析；都为空才是全新空文档。
 */
export function buildInitialContent(bodyJson?: string, bodyHtml?: string): JSONContent | string {
  if (bodyJson) {
    try {
      const parsed = JSON.parse(bodyJson)
      if (parsed && parsed.type === 'doc') return parsed
    } catch {
      // 落库 JSON 损坏时不报错阻断编辑，降级到 HTML
    }
  }
  if (bodyHtml) return bodyHtml
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

interface Props {
  noteId?: string
  bodyJson?: string
  bodyHtml?: string
  /** 变更回调：同时给出真源 JSON 与派生 HTML，一次保存写两列 */
  onChange: (next: { bodyJson: string; bodyHtml: string }) => void
}

export default function RichTextBody({ noteId, bodyJson, bodyHtml, onChange }: Props) {
  const { pickAndInsert, uploading, attach, input } = useImageUpload(noteId)

  const editor = useEditor(
    {
      content: buildInitialContent(bodyJson, bodyHtml),
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        // v2 的 StarterKit 不含这三个（v3 才并入），漏装会让链接和任务清单静默失效
        Link.configure({
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ImageExt.configure({
          inline: false,
          // 必须 false：否则粘贴/上传的图片会变成 base64 内联，
          // bodyJson 直接膨胀数 MB，打爆 4MB 字段上限与 8MB bodyLimit
          allowBase64: false,
          HTMLAttributes: { class: 'rt-image' },
        }),
        Placeholder.configure({
          placeholder: '在这里写正文… 支持标题、加粗、列表、任务清单、代码块、链接、图片',
        }),
      ],
      editorProps: {
        attributes: {
          // 关键：同时挂 markdown-body 与 rt-surface 两个类名。
          // styles.css 里那30 条 `.markdown-body X` 规则会原样命中编辑器，
          // 于是新旧两种正文永远同款，不需要复制第二份样式、也不会出现视觉漂移。
          // rt-surface 只承载编辑器专属样式（focus / placeholder / taskList 修正 / 图片约束）。
          class: 'markdown-body rt-surface',
          spellcheck: 'false',
        },
      },
      onUpdate: ({ editor: e }) => {
        onChange({ bodyJson: JSON.stringify(e.getJSON()), bodyHtml: e.getHTML() })
      },
    },
    // 依赖数组：切换笔记时必须重建编辑器，否则内容不会重载。
    // 配合父组件的 key={id ?? 'new'} 构成双保险，避免切笔记后内容串台。
    [noteId],
  )

  useEffect(() => {
    attach(editor)
  }, [editor, attach])

  if (!editor) {
    return (
      <div style={{ minHeight: 440, color: 'var(--text-muted)', padding: '20px 0' }}>
        编辑器加载中...
      </div>
    )
  }

  return (
    <div className="rt-root">
      <EditorToolbar editor={editor} uploading={uploading} onPickImage={pickAndInsert} />
      <EditorContent editor={editor} />
      {input}
    </div>
  )
}
