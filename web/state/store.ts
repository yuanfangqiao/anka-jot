/** store.ts — Jot 前端数据中枢：notes 列表、当前笔记、采集管线、标签、设置。
 *  一切写操作先落 IndexedDB（设备端事实源），同步由 lib/sync 后台接力。 */
import { computed, reactive, ref } from 'vue'
import type { JotAtt, JotNote, JotTag } from '../host'
import { callJot, TAG_COLORS } from '../host'
import * as db from '../lib/db'
import { processImage, sha256Hex } from '../lib/image'
import { processVideo } from '../lib/video'
import { SearchIndex } from '../lib/search'
import { refreshPending, onSyncChanged, pushOutbox } from '../lib/sync'

export const index = new SearchIndex()

export const notes = ref<JotNote[]>([])
export const tags = ref<JotTag[]>([])
export const ready = ref(false)

export const settings = reactive({
  locationOn: true,
  lang: 'zh-CN',
})

export const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt))

// ─── 初始化 ────────────────────────────────────────
export async function initStore() {
  const [ns, ts] = await Promise.all([db.listNotes(), db.listTags()])
  for (const n of ns) n.atts = await db.attsOf(n.id)
  notes.value = ns
  tags.value = ts
  for (const n of ns) index.upsert(n, n.atts ?? [])
  settings.locationOn = (await db.kvGet<boolean>('locationOn')) ?? true
  settings.lang = (await db.kvGet<string>('lang')) ?? 'zh-CN'
  await refreshPending()
  onSyncChanged(reload)
  ready.value = true
}

export async function reload() {
  const ns = await db.listNotes()
  for (const n of ns) n.atts = await db.attsOf(n.id)
  notes.value = ns
  tags.value = await db.listTags()
  for (const n of ns) index.upsert(n, n.atts ?? [])
  // 媒体组件观察附件元数据，自行更新展示来源。
  await refreshPending()
}

// ─── 笔记 CRUD ─────────────────────────────────────
export function newNote(source: JotNote['source'] = 'text'): JotNote {
  return {
    id: crypto.randomUUID(), title: '', text: '', tags: [], source,
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
    color: null, location: null, deleted: false, rev: 0, syncState: 'local', atts: [],
  }
}

/** 当前正在编辑的笔记（Detail 注册）：touchNote 合并其未保存内容，避免把编辑器新文字存回旧版 */
export const activeNote = ref<JotNote | null>(null)
export function setActiveNote(n: JotNote | null) { activeNote.value = n }

let saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** 500ms 防抖自动存（按笔记分桶，避免多笔记互相清掉定时器丢编辑）；空笔记不入库 */
export function saveDebounced(note: JotNote, immediate = false) {
  const id = note.id
  const old = saveTimers.get(id)
  if (old) clearTimeout(old)
  if (immediate) {
    saveTimers.delete(id)
    void persist(note)
    return
  }
  saveTimers.set(id, setTimeout(() => { saveTimers.delete(id); void persist(note) }, 500))
}
/** 立即冲刷该笔记的防抖保存（页面卸载/切换前调用） */
export async function flushSave(note: JotNote) {
  const t = saveTimers.get(note.id)
  if (t) { clearTimeout(t); saveTimers.delete(note.id) }
  await persist(note)
}
/** 取消该笔记尚未执行的保存（删除时调用，防止残留定时器把笔记复活） */
export function cancelSave(noteId: string) {
  const t = saveTimers.get(noteId)
  if (t) { clearTimeout(t); saveTimers.delete(noteId) }
}

async function persist(note: JotNote) {
  const atts = await db.attsOf(note.id)
  const empty = !note.title.trim() && !note.text.trim() && atts.length === 0
  if (empty || note.deleted) return
  // 克隆后再写，避免原地改调用方（Detail）对象的 rev/syncState 引发意外 UI 变更
  const next: JotNote = { ...note, atts, updatedAt: Date.now(), syncState: 'local' }
  await db.saveNote(next, true)
  const i = notes.value.findIndex(n => n.id === next.id)
  if (i >= 0) { notes.value[i] = { ...next } } else { notes.value.push({ ...next }) }
  index.upsert(next, atts)
  for (const t of next.tags) await ensureTag(t)
  void pushOutbox()
  await refreshPending()
}

export async function togglePin(note: JotNote) {
  note.pinned = !note.pinned
  await persist(note)
}

export async function removeNote(note: JotNote) {
  cancelSave(note.id) // 取消残留防抖，防止删除后笔记被 persist 复活
  const cur = await db.getNote(note.id)
  if (cur) await db.putHistory(cur)
  await db.tombstone(note.id)
  notes.value = notes.value.filter(n => n.id !== note.id)
  index.remove(note.id)
  try {
    await callJot('delete_note', { id: note.id })
    await db.outboxDropNote(note.id)
  } catch { /* 失败由 outbox 兜底 */ }
  await refreshPending()
}

// ─── 附件管线 ──────────────────────────────────────
export async function attachImage(noteId: string, src: Blob, pendingOcr = false): Promise<JotAtt> {
  const p = await processImage(src)
  const att: JotAtt = {
    id: crypto.randomUUID(), noteId, kind: 'image', sha256: p.sha256,
    width: p.width, height: p.height, size: p.full.size, createdAt: Date.now(), pendingOcr,
  }
  await db.putBlob(att.id, p.full)
  if (p.thumb) await db.putBlob(att.id + ':thumb', p.thumb)
  await db.putAtt(att)
  await touchNote(noteId)
  return att
}

export async function attachAudio(noteId: string, blob: Blob, duration: number,
                                  peaks: number[], transcript: JotAtt['transcript']): Promise<JotAtt> {
  const att: JotAtt = {
    id: crypto.randomUUID(), noteId, kind: 'audio', duration,
    peaks, transcript, sha256: await sha256Hex(blob), size: blob.size, createdAt: Date.now(),
  }
  await db.putBlob(att.id, blob)
  await db.putAtt(att)
  await touchNote(noteId)
  return att
}

/** 视频附件：原片落库 + 封面帧存 ':thumb'（沿用图片约定，清理/同步自动兼容） */
export async function attachVideo(noteId: string, blob: Blob): Promise<JotAtt> {
  const p = await processVideo(blob)
  const att: JotAtt = {
    id: crypto.randomUUID(), noteId, kind: 'video', sha256: p.sha256,
    width: p.width, height: p.height, duration: p.duration, size: blob.size, createdAt: Date.now(),
  }
  await db.putBlob(att.id, blob)
  if (p.poster) await db.putBlob(att.id + ':thumb', p.poster)
  await db.putAtt(att)
  await touchNote(noteId)
  return att
}

async function touchNote(noteId: string) {
  let n = await db.getNote(noteId)
  const live = activeNote.value
  if (live && live.id === noteId) {
    // 编辑器有未保存内容：以其标题/正文/标签为准（atts 以刚写入 DB 的为准）
    n = { ...(n ?? live), title: live.title, text: live.text, tags: [...live.tags] }
  } else if (!n) {
    n = notes.value.find(x => x.id === noteId) ?? null
  }
  if (!n) return
  n.updatedAt = Date.now()
  n.syncState = 'local'
  n.atts = await db.attsOf(noteId)
  await db.saveNote(n, true)
  const i = notes.value.findIndex(x => x.id === noteId)
  if (i >= 0) { notes.value[i] = { ...n } }
  index.upsert(n, n.atts)
  await refreshPending()
  void pushOutbox()
}

export async function updateAtt(att: JotAtt) {
  await db.putAtt(att)
  const n = await db.getNote(att.noteId)
  if (n) index.upsert(n, await db.attsOf(att.noteId))
}

// ─── 标签 ──────────────────────────────────────────
export async function ensureTag(name: string): Promise<JotTag> {
  const clean = name.trim().replace(/^@/, '')
  let t = tags.value.find(x => x.name === clean)
  if (!t) {
    t = { name: clean, color: TAG_COLORS[tags.value.length % TAG_COLORS.length], pinned: false, lastUsedAt: Date.now() }
    tags.value.push(t)
  } else t.lastUsedAt = Date.now()
  await db.putTag(t, true)
  return t
}

export async function tagColor(name: string): Promise<string> {
  return (await ensureTag(name)).color ?? TAG_COLORS[0]
}

// ─── 位置采集（3s 超时，失败静默） ──────────────────
export function captureLocation(note: JotNote) {
  if (!settings.locationOn || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    pos => {
      note.location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      void persist(note)
    },
    () => { /* 拒绝/超时静默 */ },
    { timeout: 3000, maximumAge: 300_000 },
  )
}

export function hasAudio(atts?: JotAtt[]): boolean {
  return Boolean(atts?.some(a => a.kind === 'audio'))
}
