import { useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { attachmentApi } from '../../api'

/** 与后端 INLINE_SAFE_MIME 白名单保持一致：只有这四类能内联渲染 */
const INLINE_SAFE_MIME = /^image\/(png|jpeg|gif|webp)$/i

/**
 * 「笔记还没创建时上传的附件」待补绑队列。
 *
 * 必须是模块级而不是 useRef：上传发生在 RichTextBody 内部，而 flushPending
 * 由 NoteEditor 调用，两者是**两个不同的 hook 实例**，各自 useRef 拿到的是
 * 两个互不共享的数组 —— 结果是 flushPending 永远读到空数组，补绑静默失效，
 * 新建笔记里的图片全部停留在 noteId=null 的游离状态。
 *
 * 放在模块作用域后，两个实例读写的是同一份队列。
 * 同一时刻只有一个编辑器在挂载（切换笔记会先卸载旧的），因此不存在串笔记的问题。
 */
let pendingAttachmentIds: string[] = []

/**
 * 富文本插图链路：选文件 → 上传 → 拿 shareToken → 拼带 ?t= 的 URL → setImage。
 *
 * 为什么必须带 token：浏览器 `<img>` 标签发不出 Authorization 头，
 * 而附件下载路由是强制 JWT 鉴权的，所以图片只能走签名 URL 路径
 * （这条路径在附件路由里是纯增量旁路，JWT 鉴权逻辑完全没变）。
 *
 * 新建笔记的时序问题（顺带修复的既有缺陷）：
 * 原来 NoteEditor 在新建时 noteId 为 undefined，上传不带 noteId，
 * 笔记建好后附件永远游离。这里用一个 pending 队列兜住：
 *   1) 新建时照常不带 noteId 上传（noteId 为空时后端存 null，允许）；
 *   2) 把 attachmentId 记进模块级待补绑队列；
 *   3) 笔记首次创建成功后调flushPending(savedId) 逐个补绑。
 * 图片 URL 用的是 attachmentId + shareToken，与是否已绑定无关，
 * 所以「保存前插的图」在绑定前也能正常显示。
 */
export function useImageUpload(noteId?: string) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)

  /** 由 RichTextBody 在编辑器创建后回填，避免 hook 与 useEditor 循环依赖 */
  const attach = (editor: Editor | null) => {
    editorRef.current = editor
  }

  const pickAndInsert = () => inputRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 富文本第一版只有 Image 节点，塞文件链接没有对应节点，
    // 硬塞会得到一段没有属性的死文本，所以这里明确只收图片
    if (!file.type.startsWith('image/')) {
      alert('富文本编辑器第一版仅支持插入图片。非图片附件请在 Markdown 笔记里上传。')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    // SVG 不在服务端白名单内，插进去会因 octet-stream + attachment 头而加载失败，
    // 在这里就拦住并说明原因，不让用户对着裂图困惑
    if (!INLINE_SAFE_MIME.test(file.type)) {
      alert('SVG 图片暂不支持在笔记内显示（会被强制下载而非内联渲染）。请改用 PNG / JPEG / GIF / WebP。')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const att = await attachmentApi.upload(file, noteId)
      if (!noteId) pendingAttachmentIds.push(att.id)
      const editor = editorRef.current
      if (!editor) return

      // 图片是块级节点，若光标正落在列表项里（TaskList 开了 nested，
      // 任务项内回车会继续产生任务项），直接 setImage 会把 <img> 塞进
      // <li> 内部，正文结构就乱了。所以先跳出列表，在顶层插入。
      // 注意 taskItem 的 type.name 是 'taskItem'，与普通无序列表的
      // 'listItem' 不同名，两种都要认。
      const { $from } = editor.state.selection
      let listItemName: string | null = null
      for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name
        if (name === 'listItem' || name === 'taskItem') {
          listItemName = name
          break
        }
      }

      const chain = editor.chain().focus()
      if (listItemName) chain.liftListItem(listItemName)
      chain
        .setImage({
          src: `/api/attachments/${att.id}/download?t=${att.shareToken}`,
          alt: att.filename,
        })
        .run()
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片上传失败')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  /** 笔记首次创建成功后调用：把「保存前上传」的附件补挂到笔记上 */
  const flushPending = async (createdNoteId: string) => {
    const ids = [...pendingAttachmentIds]
    pendingAttachmentIds = []
    if (ids.length === 0) return
    await Promise.all(
      ids.map((id) => attachmentApi.bindToNote(id, createdNoteId).catch(() => {})),
    )
  }

  const input: ReactNode = (
    <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
  )

  return { pickAndInsert, uploading, attach, flushPending, input }
}
