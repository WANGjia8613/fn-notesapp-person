import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { attachmentApi, attachmentUrl } from '../../api'
import { useToast } from '../Toast'

// 服务端 INLINE_SAFE_MIME 白名单：仅这些图片类型可内联显示（SVG 被排除以防 XSS）
const INLINE_SAFE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/**
 * 「笔记还没创建时上传的附件」待补绑队列。
 *
 * 必须是模块级而不是 useRef：上传发生在 RichTextBody 内部，而 flushPending
 * 由 NoteEditor 调用，两者是**两个不同的 hook 实例**，各自 useRef 拿到的是
 * 两个互不共享的数组 —— flushPending 恒读到空数组，补绑静默失效。
 *
 * 这个 bug 还有第二个后果：下面那段「卸载时清理游离附件」的逻辑，原本靠
 * pendingRef 空来判断「已经补绑过了」，于是保存成功、图片已被正文引用之后，
 * 编辑器因为 key 变化重新挂载，旧实例卸载时把刚用的图片从服务端删掉了。
 * 改成本模块共享队列后，flushPending 会先把队列清空，卸载清理自然变成空操作，
 * 只在「插了图但没保存就离开」时才真正触发清理。
 */
let pendingAttachmentIds: string[] = []

/**
 * 图片上传 hook：
 * - pickAndInsert：弹出文件选择 -> 上传 -> 用签名 URL 插入编辑器
 * - attach：接管编辑器的粘贴/拖拽图片事件，同样走上传通道
 * - flushPending：新建笔记场景下，把「noteId 还为空时上传」的附件补挂到新建的笔记上
 */
export function useImageUpload(noteId?: string) {
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 上传单张图片，返回可内联的签名 URL
  const uploadOne = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith('image/')) {
        toast.error('只能上传图片文件')
        return null
      }
      if (!INLINE_SAFE.includes(file.type)) {
        toast.error('该图片格式不支持内联显示（仅支持 png/jpeg/gif/webp）')
        return null
      }
      try {
        const att = await attachmentApi.upload(file, noteId)
        if (!noteId) pendingAttachmentIds.push(att.id) // 笔记还没创建，先记下来待补绑
        return await attachmentUrl(att.id, att.shareToken)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '图片上传失败')
        return null
      }
    },
    [noteId, toast],
  )

  // 选择文件并插入当前光标处
  const pickAndInsert = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }, [])

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      const url = await uploadOne(file)
      setUploading(false)
      // 通过全局事件把 URL 交给编辑器插入（editor 实例在 RichTextBody 里）
      if (url) window.dispatchEvent(new CustomEvent('rt:insert-image', { detail: url }))
    },
    [uploadOne],
  )

  // 把粘贴/拖拽/选择的事件都接到编辑器上
  const attach = useCallback(
    (editor: Editor | null) => {
      if (!editor) return

      const insertAt = (url: string) => {
        editor.chain().focus().setImage({ src: url }).run()
      }

      // 监听「选择文件后上传完成」的事件
      const handler = (ev: Event) => {
        const url = (ev as CustomEvent<string>).detail
        if (url) insertAt(url)
      }
      window.addEventListener('rt:insert-image', handler as EventListener)

      // 粘贴图片
      const dom = editor.view.dom as HTMLElement
      const onPaste = async (ev: ClipboardEvent) => {
        const items = ev.clipboardData?.items
        if (!items) return
        for (const it of Array.from(items)) {
          if (it.type.startsWith('image/')) {
            const file = it.getAsFile()
            if (file) {
              ev.preventDefault()
              setUploading(true)
              const url = await uploadOne(file)
              setUploading(false)
              if (url) insertAt(url)
              return
            }
          }
        }
      }
      // 拖拽图片
      const onDrop = async (ev: DragEvent) => {
        const files = ev.dataTransfer?.files
        if (!files || files.length === 0) return
        const file = Array.from(files).find((f) => f.type.startsWith('image/'))
        if (!file) return
        ev.preventDefault()
        setUploading(true)
        const url = await uploadOne(file)
        setUploading(false)
        if (url) insertAt(url)
      }

      dom.addEventListener('paste', onPaste as unknown as EventListener)
      dom.addEventListener('drop', onDrop as unknown as EventListener)

      return () => {
        window.removeEventListener('rt:insert-image', handler as EventListener)
        dom.removeEventListener('paste', onPaste as unknown as EventListener)
        dom.removeEventListener('drop', onDrop as unknown as EventListener)
      }
    },
    [uploadOne],
  )

  // 新建笔记保存成功后：把游离附件补挂到笔记
  const flushPending = useCallback(
    async (newNoteId: string) => {
      const ids = [...pendingAttachmentIds]
      pendingAttachmentIds = []
      await Promise.all(ids.map((id) => attachmentApi.bindToNote(id, newNoteId).catch(() => {})))
    },
    [],
  )

  // 组件卸载时清理游离附件（插了图但没保存就关闭编辑器）
  //
  // 遍历的是模块级共享队列：保存成功时 flushPending 已经把它清空，
  // 所以这里在「正常保存后离开」的场景下是空操作，不会误删已被正文引用的图片。
  // 只有真的没保存就走，队列里还留着 id，才会触发删除。
  useEffect(() => {
    return () => {
      const ids = [...pendingAttachmentIds]
      pendingAttachmentIds = []
      // 失败静默，后端有孤儿附件回收兜底
      ids.forEach((id) => attachmentApi.remove(id).catch(() => {}))
    }
  }, [])

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={INLINE_SAFE.join(',')}
      style={{ display: 'none' }}
      onChange={onInputChange}
    />
  )

  return { pickAndInsert, uploading, attach, input, flushPending }
}
