import { ref } from 'vue'
import type { JotNote } from '../host'
import { notes } from './store'
import { persist, trackNote } from './persistence'
import { copy } from '../lib/noteMerge'

export const todoUndo = ref<{ noteId: string; id: string; text: string; before: boolean; after: boolean } | null>(null)
export const todoBusy = ref(false)
async function setDone(note: JotNote, id: string, done: boolean) {
  const latest = notes.value.find(n => n.id === note.id) ?? note
  const draft = trackNote(copy(latest))
  const item = draft.todos?.find(t => t.id === id)
  if (!item) return
  item.done = done
  await persist(draft)
}
export async function toggleCardTodo(note: JotNote, id: string) {
  if (todoBusy.value) return
  const item = note.todos?.find(t => t.id === id)
  if (!item) return
  todoBusy.value = true
  const action = { noteId: note.id, id, text: item.text, before: item.done, after: !item.done }
  try { await setDone(note, id, action.after); todoUndo.value = action }
  finally { todoBusy.value = false }
}
export async function undoCardTodo() {
  const last = todoUndo.value
  if (!last || todoBusy.value) return
  const note = notes.value.find(n => n.id === last.noteId)
  const item = note?.todos?.find(t => t.id === last.id)
  if (!note || item?.done !== last.after) { todoUndo.value = null; return }
  todoBusy.value = true
  try { await setDone(note, last.id, last.before); todoUndo.value = null }
  finally { todoBusy.value = false }
}
