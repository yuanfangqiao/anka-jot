import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { JotAtt, JotNote } from '../host'
import * as db from './db'
import { changed, copy, mergeNote } from './noteMerge'
import { draftBase, saveError, saving, pendingSaves, trackNote } from '../state/persistence'
import { syncState } from './sync'
import { notes, setActiveNote } from '../state/store'

/** Reading follows updates; an active input keeps its value, focus and caret. */
export function useEditorUpdates(note: Ref<JotNote | null>, atts: Ref<JotAtt[]>) {
  const editor = ref<HTMLElement>()
  const bodyInput = ref<HTMLTextAreaElement>()
  const pending = ref<JotNote | null>(null)
  const notice = ref('')
  let alive = true
  let width = 0
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    const next = entries[0]?.contentRect.width ?? 0
    if (next !== width) { width = next; resizeBody() }
  })
  watch(editor, el => { observer?.disconnect(); if (el) observer?.observe(el) })
  const status = computed(() => saveError.value ? '保存失败，请重试'
    : saving.value || pendingSaves.value.has(note.value?.id ?? '') ? '保存中…' : note.value?.syncState === 'synced' ? '已同步' : '已存本机 · 待同步')
  function resizeBody() {
    const el = bodyInput.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(96, el.scrollHeight) + 'px'
  }
  function inputFocused() {
    const el = document.activeElement
    return editor.value?.contains(el) && el?.matches('input,textarea,[contenteditable]')
  }
  async function receive(latest: JotNote, explicit = false) {
    const draft = note.value
    if (!draft || draft.id !== latest.id || !alive) return
    const base = draftBase(draft)
    if (changed(base, latest) && inputFocused() && !explicit) {
      pending.value = copy(latest)
      return
    }
    const { next, conflicts } = mergeNote(base, draft, latest)
    if (conflicts.length) notice.value = '检测到另一处编辑，当前草稿已保留；其他版本可在历史中查看。'
    // Mutate in place so current input DOM and selection survive acknowledgements.
    Object.assign(draft, next)
    trackNote(draft, latest)
    setActiveNote(draft)
    pending.value = null
    const fresh = await db.attsOf(draft.id)
    if (alive) atts.value = fresh
    await nextTick(resizeBody)
  }
  function applyPending() { if (pending.value) void receive(pending.value, true) }
  function focusOut() {
    void nextTick(() => { if (!inputFocused()) applyPending() })
  }
  watch(() => notes.value.find(n => n.id === note.value?.id), latest => {
    if (latest) void receive(latest)
  })
  watch(() => note.value?.text, () => nextTick(resizeBody), { flush: 'post' })
  watch(() => syncState.conflictNoteId, id => {
    if (id === note.value?.id) notice.value = '另一台设备同时修改了相同内容，双方版本已保存，可在历史版本中恢复。'
  })
  const onResize = () => resizeBody()
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize)
  onBeforeUnmount(() => { alive = false; observer?.disconnect(); window.removeEventListener('resize', onResize) })
  return { editor, bodyInput, pending, notice, status, resizeBody, applyPending, focusOut }
}
