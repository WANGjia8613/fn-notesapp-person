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
 * 初始内容三级兜底：JSON 优先 -> HTML 兜底 -> 空文档。
 * JSON 是编辑真源，能 100% 还原列表/标题层级与任务勾选状态；
 * JSON 缺失或损坏才退回 HTML；都为空才是全新空文档。
 */
export function buildInitialContent(bodyJson?: string, bodyHtml?: string): JSONContent | string {
  if (bodyJson) {
    try {
      const parsed = JSON.parse(bodyJson)
      if (parsed && parsed.type === 'doc') return parsed
    } catch {
      // JSON 损坏不阻断编辑，降级到 HTML
    }
  }
  if (bodyHtml) return bodyHtml
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

interface Props {
  noteId?: string
  bodyJson?: string
  bodyHtml?: string
  onChange: (next: { bodyJson: string; bodyHtml: string }) => void
}

export default function RichTextBody({ noteId, bodyJson, bodyHtml, onChange }: Props) {
  const { pickAndInsert, uploading, attach, input } = useImageUpload(noteId)

  const editor = useEditor(
    {
      content: buildInitialContent(bodyJson, bodyHtml),
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        // v2 的 StarterKit 不含这三个，漏装会让链接和任务清单静默失效
        Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ImageExt.configure({
          inline: false, // 必须 false：否则图片变 base64 内联，撑爆字段上限
          allowBase64: false,
          HTMLAttributes: { class: 'rt-image' },
        }),
        Placeholder.configure({ placeholder: '在这里写正文… 支持标题、加粗、列表、任务清单、代码块、链接、图片' }),
      ],
      editorProps: {
        attributes: {
          // 同时挂 markdown-body 与 rt-surface：两套正文永远同款样式
          class: 'markdown-body rt-surface',
          spellcheck: 'false',
        },
      },
      onUpdate: ({ editor: e }) => {
        onChange({ bodyJson: JSON.stringify(e.getJSON()), bodyHtml: e.getHTML() })
      },
    },
    [noteId], // 切换笔记时重建编辑器
  )

  useEffect(() => {
    return attach(editor)
  }, [editor, attach])

  if (!editor) {
    return (
      <div style={{ minHeight: 440, padding: '20px 0' }}>
        <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: '85%' }} />
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
