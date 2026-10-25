/** Draft baselines, atomic local saves and durable save scheduling. */
import { ref, toRaw } from 'vue'
import type { JotNote } from '../host'
import { toast } from '../host'
import * as db from '../lib/db'
import { copy, mergeNote } from '../lib/noteMerge'
import { pushOutbox, refreshPending } from '../lib/sync'
import { notes, index, ensureTag } from './store'

export const activeNote = ref<JotNote | null>(null)
export function setActiveNote(n: JotNote | null) { activeNote.value = n }
const baselines = new WeakMap<object, JotNote>()
export function trackNote<T extends JotNote>(note: T, base: JotNote = note): T {
  baselines.set(toRaw(note), copy(base))
  return note
}
export function draftBase(note: JotNote) {
  return baselines.get(toRaw(note)) ?? note.syncBase ?? note
}
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const saveQueues = new Map<string, Promise<void>>()
export const saving = ref(0)
export const pendingSaves = ref(new Set<string>())
export const saveError = ref('')

export function saveDebounced(note: JotNote, immediate = false) {
  cancelSave(note.id)
  pendingSaves.value.add(note.id)
  if (immediate) { void persist(note); return }
  saveTimers.set(note.id, setTimeout(() => { saveTimers.delete(note.id); void persist(note) }, 500))
}
export async function flushSave(note: JotNote) {
  cancelSave(note.id)
  await persist(note)
}
export function cancelSave(id: string) {
  const timer = saveTimers.get(id)
  if (timer) clearTimeout(timer)
  saveTimers.delete(id)
  pendingSaves.value.delete(id)
}
export function persist(note: JotNote, force = false): Promise<void> {
  // Capture before the first await: component teardown may mutate or release the draft.
  const snapshot = copy(note)
  const base = copy(draftBase(note))
  const previous = saveQueues.get(note.id) ?? Promise.resolve()
  saving.value++
  const task = previous.catch(() => {}).then(async () => {
    const atts = await db.attsOf(snapshot.id)
    const hasTodos = snapshot.todos?.some(t => t.text.trim()) || snapshot.todo
    if ((!snapshot.title.trim() && !snapshot.text.trim() && !hasTodos && !atts.length) || snapshot.deleted) return
    const next = await db.editNote(snapshot, base, force)
    const live = mergeNote(snapshot, note, next).next
    Object.assign(note, live)
    trackNote(note, next)
    if (next.deleted) {
      notes.value = notes.value.filter(n => n.id !== next.id)
      index.remove(next.id)
      return
    }
    next.atts = atts
    const i = notes.value.findIndex(n => n.id === next.id)
    const tracked = trackNote(copy(next))
    if (i >= 0) notes.value[i] = tracked
    else notes.value.push(tracked)
    index.upsert(next, atts)
    for (const tag of next.tags) await ensureTag(tag)
    saveError.value = ''
    void pushOutbox()
    await refreshPending()
  }).catch((error: any) => {
    saveError.value = error?.message ?? '本地保存失败'
    toast('保存失败，请保留页面并重试', false)
    throw error
  }).finally(() => {
    saving.value--
    if (!saveTimers.has(note.id)) pendingSaves.value.delete(note.id)
    if (saveQueues.get(note.id) === task) saveQueues.delete(note.id)
  })
  saveQueues.set(note.id, task)
  // Scheduled saves report the failure in the UI, rather than an unhandled rejection.
  void task.catch(() => {})
  return task
}
