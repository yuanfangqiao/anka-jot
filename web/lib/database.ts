/** db.ts — IndexedDB 轻封装：设备端事实源（jot-db v1）。零依赖手写。 */

const DB = 'jot-db'
const VER = 1
export const T = { notes: 'notes', atts: 'atts', blobs: 'blobs', tags: 'tags', outbox: 'outbox', kv: 'kv', history: 'history' } as const

let dbp: Promise<IDBDatabase> | null = null

export function open(): Promise<IDBDatabase> {
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
    rq.onsuccess = () => {
      const connection = rq.result
      connection.onclose = () => { dbp = null }
      connection.onversionchange = () => { connection.close(); dbp = null }
      res(connection)
    }
    rq.onerror = () => { dbp = null; rej(rq.error) } // 打开失败不缓存，允许后续重试
  })
  return dbp
}

function tx(d: IDBDatabase, stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
  return Promise.resolve(d.transaction(stores, mode))
}
export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
export function done(t: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
}

/** Vue 响应式 Proxy 无法被 IndexedDB 结构化克隆（DataCloneError），入库前还原为纯对象 */
export function plain<T>(o: T): T {
  return JSON.parse(JSON.stringify(o))
}

