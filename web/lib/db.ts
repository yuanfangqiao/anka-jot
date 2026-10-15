/** db.ts — IndexedDB 轻封装：设备端事实源（jot-db v1）。零依赖手写。 */
import type { JotAtt, JotNote, JotTag } from '../host'

const DB = 'jot-db'
const VER = 1
export const T = { notes: 'notes', atts: 'atts', blobs: 'blobs', tags: 'tags', outbox: 'outbox', kv: 'kv', history: 'history' } as const

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const rq = indexedDB.open(DB, VER)
    rq.onupgradeneeded = () => {
      const d = rq.result
      if (!d.objectStoreNames.contains(T.notes)) {
        const s = d.createObjectStore(T.notes, { keyPath: 'id' })
        s.createIndex('updatedAt', 'updatedAt'); s.createIndex('createdAt', 'createdAt')
      }
      if (!d.objectStoreNames.contains(T.atts)) {
        const s = d.createObjectStore(T.atts, { keyPath: 'id' }); s.createIndex('noteId', 'noteId')
      }
      if (!d.objectStoreNames.contains(T.blobs)) d.createObjectStore(T.blobs, { keyPath: 'key' })
      if (!d.objectStoreNames.contains(T.tags)) d.createObjectStore(T.tags, { keyPath: 'name' })
      if (!d.objectStoreNames.contains(T.outbox)) d.createObjectStore(T.outbox, { keyPath: 'seq', autoIncrement: true })
      if (!d.objectStoreNames.contains(T.kv)) d.createObjectStore(T.kv, { keyPath: 'k' })
      if (!d.objectStoreNames.contains(T.history)) {
        const s = d.createObjectStore(T.history, { keyPath: 'hid', autoIncrement: true })
        s.createIndex('noteId', 'noteId')
      }
    }
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => { dbp = null; rej(rq.error) } // 打开失败不缓存，允许后续重试
  })
  return dbp
}

function tx(d: IDBDatabase, stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
  return Promise.resolve(d.transaction(stores, mode))
}
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
function done(t: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
}

/** Vue 响应式 Proxy 无法被 IndexedDB 结构化克隆（DataCloneError），入库前还原为纯对象 */
function plain<T>(o: T): T {
  return JSON.parse(JSON.stringify(o))
}

// ─── kv ────────────────────────────────────────────
export async function kvGet<T>(k: string): Promise<T | null> {
  const d = await open()
  const r = await req<{ k: string; v: T } | undefined>(d.transaction(T.kv).objectStore(T.kv).get(k))
  return r ? r.v : null
}
export async function kvSet(k: string, v: unknown) {
  const d = await open()
  const t = d.transaction(T.kv, 'readwrite')
  t.objectStore(T.kv).put({ k, v })
  await done(t)
}

// ─── notes ─────────────────────────────────────────
export async function listNotes(includeDeleted = false): Promise<JotNote[]> {
  const d = await open()
  const all = await req<JotNote[]>(d.transaction(T.notes).objectStore(T.notes).getAll())
  return all.filter(n => includeDeleted || !n.deleted)
}
export async function getNote(id: string): Promise<JotNote | null> {
  const d = await open()
  return (await req<JotNote | undefined>(d.transaction(T.notes).objectStore(T.notes).get(id))) ?? null
}
/** 写笔记 + 附件元数据 + outbox 追加，同一事务（离线队列原子性） */
export async function saveNote(note: JotNote, queueSync = true) {
  const d = await open()
  const t = await tx(d, [T.notes, T.outbox], 'readwrite')
  t.objectStore(T.notes).put(plain(note))
  if (queueSync) t.objectStore(T.outbox).add({ type: 'note.upsert', noteId: note.id, createdAt: Date.now() })
  await done(t)
}
export async function tombstone(id: string) {
  const d = await open()
  const t = await tx(d, [T.notes, T.outbox], 'readwrite')
  const n = await req<JotNote | undefined>(t.objectStore(T.notes).get(id))
  if (n) t.objectStore(T.notes).put({ ...n, deleted: true, updatedAt: Date.now() })
  t.objectStore(T.outbox).add({ type: 'note.delete', noteId: id, createdAt: Date.now() })
  await done(t)
}
export async function putHistory(note: JotNote) {
  const d = await open()
  const t = d.transaction(T.history, 'readwrite')
  t.objectStore(T.history).add({ noteId: note.id, snap: note, at: Date.now() })
  await done(t)
}

// ─── atts / blobs ──────────────────────────────────
export async function putAtt(a: JotAtt) {
  const d = await open()
  const t = d.transaction(T.atts, 'readwrite'); t.objectStore(T.atts).put(plain(a)); await done(t)
}
/** 删除单个附件及其 blob（拉取时清理服务端已删的附件） */
export async function delAtt(attId: string) {
  const d = await open()
  const t = d.transaction([T.atts, T.blobs], 'readwrite')
  t.objectStore(T.atts).delete(attId)
  evictBlob(t.objectStore(T.blobs), attId)
  evictBlob(t.objectStore(T.blobs), attId + ':thumb')
  await done(t)
}
export async function attsOf(noteId: string): Promise<JotAtt[]> {
  const d = await open()
  const r = await req<JotAtt[]>(d.transaction(T.atts).objectStore(T.atts).index('noteId').getAll(noteId))
  return r.sort((a, b) => a.createdAt - b.createdAt)
}
export async function allAtts(): Promise<JotAtt[]> {
  const d = await open()
  return req<JotAtt[]>(d.transaction(T.atts).objectStore(T.atts).getAll())
}
export async function delAttsOf(noteId: string) {
  const d = await open()
  const t = d.transaction([T.atts, T.blobs], 'readwrite')
  const arr = await req<JotAtt[]>(t.objectStore(T.atts).index('noteId').getAll(noteId))
  for (const a of arr) {
    t.objectStore(T.atts).delete(a.id)
    evictBlob(t.objectStore(T.blobs), a.id)
    evictBlob(t.objectStore(T.blobs), a.id + ':thumb')
  }
  await done(t)
}
export async function putBlob(key: string, blob: Blob) {
  const d = await open()
  const t = d.transaction(T.blobs, 'readwrite'); t.objectStore(T.blobs).put({ key, blob }); await done(t)
  bumpLru(key)
}
export async function getBlob(key: string): Promise<Blob | null> {
  const d = await open()
  const r = await req<{ blob: Blob } | undefined>(d.transaction(T.blobs).objectStore(T.blobs).get(key))
  return r?.blob ?? null
}

const urlCache = new Map<string, string>()
export async function blobUrl(key: string): Promise<string | null> {
  const hit = urlCache.get(key); if (hit) { bumpLru(key); return hit }
  const b = await getBlob(key); if (!b) return null
  const u = URL.createObjectURL(b); urlCache.set(key, u); bumpLru(key); return u
}

// ─── blob LRU（本地缓存上限） ─────────────────────
/** 最近使用时间：会话内存为准，trim 时合并持久 kv('blobLru') 一次性写回，
 *  避免大 blob 行的高频读写放大。淘汰只按 key 删行，全程不物化 blob 内容。 */
const lru = new Map<string, number>()
function bumpLru(key: string) { lru.set(key, Date.now()) }
function dropLru(key: string) { lru.delete(key) }

/** 撤销 objectURL 并删除 blob 行（删除附件 / LRU 淘汰共用；store 参数须来自 readwrite 事务） */
function evictBlob(store: IDBObjectStore, key: string) {
  store.delete(key)
  const u = urlCache.get(key)
  if (u) { URL.revokeObjectURL(u); urlCache.delete(key) }
  dropLru(key)
}

/** LRU 淘汰已同步的全量 blob，保留最近 keep 个。
 *  - 缩略图（':thumb'）不参与淘汰：体小且是列表封面体验的关键
 *  - protect 内的附件 id 不动（尚未同步成功，删了即永久丢）
 *  - blobs 表存在但无 LRU 记录的（历史数据/孤儿）按最旧优先清理 */
export async function trimBlobs(keep = 20, protect: Set<string> = new Set()) {
  const persistent = (await kvGet<Record<string, number>>('blobLru')) ?? {}
  const merged = new Map(Object.entries(persistent))
  for (const [k, v] of lru) merged.set(k, v)
  const d = await open()
  const keys = await req<IDBValidKey[]>(d.transaction(T.blobs).objectStore(T.blobs).getAllKeys())
  const exist = new Set(keys.map(String))
  for (const k of [...merged.keys()]) if (!exist.has(k)) { merged.delete(k); dropLru(k) } // 收敛孤儿 LRU 条目
  for (const k of exist) if (!merged.has(k)) merged.set(k, 0) // 历史数据按最旧
  const cand = [...merged.entries()]
    .filter(([k]) => !k.endsWith(':thumb') && !protect.has(k))
    .sort((a, b) => b[1] - a[1])
  if (cand.length <= keep) return
  const t = await tx(d, [T.blobs, T.kv], 'readwrite')
  for (const [k] of cand.slice(keep)) { evictBlob(t.objectStore(T.blobs), k); merged.delete(k) }
  t.objectStore(T.kv).put({ k: 'blobLru', v: Object.fromEntries(merged) })
  await done(t)
}

// ─── tags ──────────────────────────────────────────
export async function listTags(): Promise<JotTag[]> {
  const d = await open()
  const all = await req<JotTag[]>(d.transaction(T.tags).objectStore(T.tags).getAll())
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastUsedAt - a.lastUsedAt)
}
export async function putTag(t: JotTag, queueSync = true) {
  const d = await open()
  const tr = d.transaction([T.tags, T.outbox], 'readwrite')
  tr.objectStore(T.tags).put(plain(t))
  if (queueSync) tr.objectStore(T.outbox).add({ type: 'tag.upsert', name: t.name, createdAt: Date.now() })
  await done(tr)
}

// ─── outbox ────────────────────────────────────────
export interface OutboxItem { seq?: number; type: string; noteId?: string; name?: string; attempts?: number; createdAt: number }
export async function outboxAll(): Promise<OutboxItem[]> {
  const d = await open()
  return req<OutboxItem[]>(d.transaction(T.outbox).objectStore(T.outbox).getAll())
}
export async function outboxCount(): Promise<number> {
  const d = await open()
  return req<number>(d.transaction(T.outbox).objectStore(T.outbox).count())
}
export async function outboxDrop(seq: number) {
  const d = await open()
  const t = d.transaction(T.outbox, 'readwrite'); t.objectStore(T.outbox).delete(seq); await done(t)
}
/** 记录一次失败：attempts+1；达到上限则删除（死信）。返回是否已被死信丢弃 */
export async function outboxFail(seq: number, maxAttempts: number): Promise<boolean> {
  const d = await open()
  const t = d.transaction(T.outbox, 'readwrite')
  const it = await req<OutboxItem | undefined>(t.objectStore(T.outbox).get(seq))
  if (!it) { await done(t); return true }
  const n = (it.attempts ?? 0) + 1
  if (n >= maxAttempts) {
    t.objectStore(T.outbox).delete(seq)
    await done(t)
    console.warn('[jot] outbox 死信丢弃:', it.type, it.noteId ?? it.name ?? '')
    return true
  }
  t.objectStore(T.outbox).put({ ...it, attempts: n })
  await done(t)
  return false
}
/** 直写服务端成功后，清掉该笔记的待同步条目 */
export async function outboxDropNote(noteId: string) {
  const d = await open()
  const t = d.transaction(T.outbox, 'readwrite')
  const all = await req<OutboxItem[]>(t.objectStore(T.outbox).getAll())
  for (const it of all) if (it.noteId === noteId && it.seq != null) t.objectStore(T.outbox).delete(it.seq)
  await done(t)
}

/** 存储用量估算（设置页展示） */
export async function usage(): Promise<string> {
  try {
    const e = await navigator.storage?.estimate()
    if (e?.usage) return (e.usage / 1048576).toFixed(1) + ' MB'
  } catch { /* 不支持则省略 */ }
  return '—'
}
