/** User-initiated paste only: capture clipboard data synchronously before awaiting IDB. */
import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'
import { toast, type JotAtt, type JotNote } from '../host'
import { nav, push } from '../lib/nav'
import { attachImage, flushSave, newNote } from './store'

export function clipboardContent(data: DataTransfer | null) {
  if (!data) return { text: '', images: [] as File[] }
  // items and files describe the same images. Use one source to avoid duplicates.
  const files = Array.from(data.items ?? [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile()).filter((file): file is File => Boolean(file))
  return {
    text: data.getData('text/plain'),
    images: files.length ? files : Array.from(data.files ?? []).filter(file => file.type.startsWith('image/')),
  }
}

function editable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable ||
    Boolean(target.closest('input,textarea,select,[role="textbox"]')))
}

function modalOpen() { return Boolean(document.querySelector('[role="dialog"],[aria-modal="true"]')) }

async function addImages(note: JotNote, images: File[], attached?: Ref<JotAtt[]>) {
  let added = 0
  for (const image of images) {
    try {
      const att = await attachImage(note.id, image)
      if (attached && !attached.value.some(a => a.id === att.id)) attached.value.push(att)
      added++
    } catch { toast('这张图片未能粘贴，请重新复制后重试', false) }
  }
  return added
}

/** Mounted once per app; hidden/cached apps and active text fields never consume paste. */
export function usePasteCapture(root: Ref<HTMLElement | undefined>, blocked: () => boolean) {
  let alive = true
  let busy = false
  function active() {
    return alive && location.pathname === '/anka-jot' && Boolean(root.value?.getClientRects().length)
  }
  function onPaste(event: ClipboardEvent) {
    if (event.defaultPrevented || !active() || blocked() || editable(event.target) || modalOpen()) return
    const { text, images } = clipboardContent(event.clipboardData)
    if (!text.trim() && !images.length) return
    event.preventDefault()
    if (busy) { toast('正在粘贴上一条内容，请稍后再试'); return }
    const origin = nav.current
    busy = true
    void (async () => {
      const note = newNote('share')
      note.text = text
      const added = await addImages(note, images)
      if (!text.trim() && !added) return
      await flushSave(note)
      // Finish saving even if the user switches apps; never navigate them back.
      if (!active() || nav.current !== origin) return
      push('note', { id: note.id, pasted: '1' })
    })().catch(() => toast('粘贴保存失败，请重新粘贴重试', false))
      .finally(() => { busy = false })
  }
  onMounted(() => document.addEventListener('paste', onPaste))
  onBeforeUnmount(() => { alive = false; document.removeEventListener('paste', onPaste) })
}

/** Images pasted inside a note belong to that note; plain text keeps native undo/caret behavior. */
export function useDetailPaste(note: Ref<JotNote | null>, atts: Ref<JotAtt[]>) {
  let queue = Promise.resolve()
  return function onPaste(event: ClipboardEvent) {
    if (event.defaultPrevented || !note.value || modalOpen()) return
    const { text, images } = clipboardContent(event.clipboardData)
    if (!images.length) return
    const target = event.target
    // Labels, titles and todo fields keep their normal paste semantics.
    if (editable(target) && !(target instanceof HTMLTextAreaElement && target.matches('.jot-editor-text'))) return
    event.preventDefault()
    const draft = note.value
    if (text && target instanceof HTMLTextAreaElement) {
      target.setRangeText(text, target.selectionStart, target.selectionEnd, 'end')
      target.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (text) draft.text += (draft.text ? '\n' : '') + text
    queue = queue.catch(() => {}).then(async () => {
      await addImages(draft, images, atts)
      await flushSave(draft)
      await nextTick()
    }).catch(() => toast('图片保存失败，请重新粘贴重试', false))
  }
}
