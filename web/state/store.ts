/** store.ts — Jot 前端数据中枢：notes 列表、当前笔记、采集管线、标签、设置。
 *  一切写操作先落 IndexedDB（设备端事实源），同步由 lib/sync 后台接力。 */
import { computed, reactive, ref } from 'vue'
import type { JotAtt, JotNote, JotTag } from '../host'
import { callJot, toast, TAG_COLORS } from '../host'
import * as db from '../lib/db'
import { processImage, sha256Hex } from '../lib/image'
import { processVideo } from '../lib/video'
import { SearchIndex } from '../lib/search'
import { normalizeNoteTodos } from '../lib/todos'
import { refreshPending, onSyncChanged, pushOutbox } from '../lib/sync'

export const index = new SearchIndex()

export const notes = ref<JotNote[]>([])
export const tags = ref<JotTag[]>([])
export const ready = ref(false)

export const settings = reactive({
  locationOn: true,
  lang: 'zh-CN',
  /** 前置（自拍）成片左右翻转；后置始终不镜像 */
  selfieMirror: true,
})

export const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt))

/** 置顶上限：满 10 条时拒绝新的置顶（提示先取消一个） */
export const PIN_LIMIT = 10

/** 置顶时刻（本地 kv）：让置顶条严格按「置顶动作」倒序，后续编辑笔记不会把卡挪到最左 */
const pinOrder = reactive<Record<string, number>>({})

/** 补全历史数据的置顶时刻：没有记录的用 updatedAt 兜底，排序不会跳动 */
async function loadPinOrder() {
  const saved = (await db.kvGet<Record<string, number>>('pinOrder')) ?? {}
  for (const [id, at] of Object.entries(saved)) pinOrder[id] = at
  for (const n of notes.value) {
    if (n.pinned && !pinOrder[n.id]) pinOrder[n.id] = n.updatedAt || n.createdAt
  }
}
function savePinOrder() { void db.kvSet('pinOrder', { ...pinOrder }) }

/** 置顶列表：最新置顶的排最左（最多 PIN_LIMIT 条） */
export const pinnedNotes = computed(() =>
  notes.value
    .filter(n => n.pinned && !n.deleted)
    .sort((a, b) =>
      (pinOrder[b.id] ?? b.updatedAt) - (pinOrder[a.id] ?? a.updatedAt) || b.createdAt - a.createdAt))

// ─── 初始化 ────────────────────────────────────────
/** 老数据懒迁移：正文 `- [ ]` 行拆进 note.todos，补齐 todo 标志。
 *  批量单事务落库并入 outbox；不改 updatedAt，时间线不重排。 */
async function migrateLegacyTodos(ns: JotNote[]) {
  const changed = ns.filter(n => normalizeNoteTodos(n))
  if (!changed.length) return
  await db.saveNotes(changed, true)
  void pushOutbox()
}

export async function initStore() {
  const [ns, ts, byNote] = await Promise.all([db.listNotes(), db.listTags(), db.attsByNote()])
  for (const n of ns) n.atts = byNote.get(n.id) ?? []
  await migrateLegacyTodos(ns)
  notes.value = ns
  tags.value = ts
  for (const n of ns) index.upsert(n, n.atts ?? [])
  await loadPinOrder()
  settings.locationOn = (await db.kvGet<boolean>('locationOn')) ?? true
  settings.lang = (await db.kvGet<string>('lang')) ?? 'zh-CN'
  settings.selfieMirror = (await db.kvGet<boolean>('selfieMirror')) ?? true
  await refreshPending()
  onSyncChanged(patchFromSync)
  ready.value = true
}

export async function reload() {
  const [ns, ts, byNote] = await Promise.all([db.listNotes(), db.listTags(), db.attsByNote()])
  for (const n of ns) n.atts = byNote.get(n.id) ?? []
  await migrateLegacyTodos(ns)
  notes.value = ns
  tags.value = ts
  for (const n of ns) index.upsert(n, n.atts ?? [])
  // 同步可能带来别处置顶的笔记：补一条置顶时刻，避免排序退化成 0
  for (const n of ns) if (n.pinned && !pinOrder[n.id]) pinOrder[n.id] = n.updatedAt || n.createdAt
  // 媒体组件观察附件元数据，自行更新展示来源。
  await refreshPending()
}

/** 单条上限：超过就退回整表重载，避免异常情况下串行读放大成 N+1 */
const PATCH_LIMIT = 40

/** 同步回调：有受影响 id 时只重读这几条笔记（自动保存后走这里），
 *  没有 id（全量对账 / 升级修复）才整表重载。 */
async function patchFromSync(ids?: string[]) {
  if (!ids) { await reload(); return }
  await refreshPending()
  if (!ids.length) return
  if (ids.length > PATCH_LIMIT) { await reload(); return }

  let changed = false
  for (const id of new Set(ids)) {
    const fresh = await db.getNote(id)
    const i = notes.value.findIndex(n => n.id === id)
    if (!fresh || fresh.deleted) {
      if (i >= 0) { notes.value.splice(i, 1); index.remove(id) }
      continue
    }
    const atts = await db.attsOf(id)
    fresh.atts = atts
    if (i >= 0) notes.value[i] = fresh
    else notes.value.push(fresh)
    index.upsert(fresh, atts)
    if (fresh.pinned && !pinOrder[fresh.id]) pinOrder[fresh.id] = fresh.updatedAt || fresh.createdAt
    changed = true
  }
  // 标签可能随同步落库（其他设备新增），随受影响笔记一起刷新
  if (changed) tags.value = await db.listTags()
}

/** 远端按 id 取回的笔记：只并入内存列表与搜索索引，不触发 outbox、不改同步语义。
 *  持久化由调用方（`lib/api.calendar.ts`）负责，避免这里再引入一条写路径。 */
export function adoptRemoteNote(note: JotNote) {
  const i = notes.value.findIndex(n => n.id === note.id)
  if (i >= 0) notes.value[i] = note
  else notes.value.push(note)
  index.upsert(note, note.atts ?? [])
}

// ─── 笔记 CRUD ─────────────────────────────────────
export function newNote(source: JotNote['source'] = 'text'): JotNote {
  return {
    id: crypto.randomUUID(), title: '', text: '', tags: [], source,
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false, fav: false,
    todo: false, todos: [],
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
  // 纯清单笔记（无标题/正文/附件）必须留下；只点亮待办标志的笔记也算有内容
  const hasTodos = (note.todos ?? []).some(t => t.text.trim()) || note.todo === true
  const empty = !note.title.trim() && !note.text.trim() && !hasTodos && atts.length === 0
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

/** 置顶/取消置顶。返回是否真的落库（满额被拒时 false，调用方不要提示「已置顶」）。 */
export async function togglePin(note: JotNote): Promise<boolean> {
  if (!note.pinned) {
    if (notes.value.filter(n => n.pinned && !n.deleted).length >= PIN_LIMIT) {
      toast(`最多置顶 ${PIN_LIMIT} 条，请先取消一个`)
      return false
    }
    note.pinned = true
    pinOrder[note.id] = Date.now() // 记录置顶时刻：最新置顶排最左
  } else {
    note.pinned = false
    delete pinOrder[note.id]
  }
  savePinOrder()
  await persist(note)
  return true
}

export async function toggleFav(note: JotNote) {
  note.fav = !note.fav
  await persist(note)
}

/** 待办标志：只影响卡型与待办页收录，不动事项列表 */
export async function toggleTodoFlag(note: JotNote) {
  note.todo = !note.todo
  await persist(note)
}

export async function removeNote(note: JotNote) {
  cancelSave(note.id) // 取消残留防抖，防止删除后笔记被 persist 复活
  if (pinOrder[note.id]) { delete pinOrder[note.id]; savePinOrder() }
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
                                  peaks: number[], transcript: JotAtt['transcript']): Promise<JotAtt | null> {
  // 0 字节录音（流没采到数据 / iOS 音频会话失效）没有任何内容可存：
  // 落库只会得到空附件，同步时被服务端以「文件大小非法」永久拒绝。直接拒收，由录音页提示。
  if (!blob.size) return null
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
    // 编辑器有未保存内容：以其标题/正文/标签/事项为准（atts 以刚写入 DB 的为准）
    n = { ...(n ?? live), title: live.title, text: live.text, tags: [...live.tags],
      todo: live.todo, todos: (live.todos ?? []).map(t => ({ ...t })) }
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
