/** sync.ts — 同步引擎（DESIGN 方案 B：/call 推拉，笔记级 LWW）。
 *  推送：outbox 顺序消费；媒体先于 note.upsert 上传（分块 base64）。
 *  拉取：snapshot(sinceRev) 增量合并，rev 大者胜。
 *  触发：online 事件 + 60s 前台心跳 + 手动。 */
import { reactive } from 'vue'
import { callJot, type JotAtt, type JotNote } from '../host'
import * as db from './db'
import { blobToB64 } from './image'

const CHUNK = 768 * 1024 // base64 前原始字节/块

export const syncState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  backendUp: null as boolean | null, // null=未知
  lastError: '',
  lastPullRev: 0,
})

let pushing = false
let onChanged: (() => void) | null = null
export function onSyncChanged(fn: () => void) { onChanged = fn }

export async function refreshPending() {
  syncState.pending = await db.outboxCount()
}

// ─── 媒体上传 ──────────────────────────────────────
async function uploadAtt(att: JotAtt): Promise<boolean> {
  if (att.serverPath) return true
  const blob = await db.getBlob(att.id)
  if (!blob || !att.sha256) return false
  const begin = await callJot('upload_begin', {
    attId: att.id, kind: att.kind, mime: att.kind === 'image' ? 'image/jpeg' : blob.type,
    size: blob.size, sha256: att.sha256,
  })
  if (begin?.exists) {
    await db.putAtt({ ...att, serverPath: begin.path })
    return true
  }
  const b64 = await blobToB64(blob)
  const per = Math.ceil(CHUNK * 4 / 3) // 每块 base64 字符数
  let seq = 0
  for (let off = 0; off < b64.length; off += per) {
    await callJot('upload_chunk', { attId: att.id, seq: seq++, b64: b64.slice(off, off + per) })
  }
  const thumb = att.kind === 'image' ? await db.getBlob(att.id + ':thumb') : null
  const r = await callJot('upload_end', {
    attId: att.id, thumbB64: thumb ? await blobToB64(thumb) : undefined,
  })
  await db.putAtt({ ...att, serverPath: r.path, thumbPath: r.thumbPath ?? null })
  return true
}

// ─── 推送 ──────────────────────────────────────────
export async function pushOutbox(): Promise<void> {
  if (pushing || !syncState.online) return
  pushing = true
  syncState.syncing = true
  try {
    const items = await db.outboxAll()
    for (const it of items) {
      try {
        if (it.type === 'note.upsert' && it.noteId) {
          const note = await db.getNote(it.noteId)
          if (!note) { await db.outboxDrop(it.seq!); continue }
          const atts = await db.attsOf(note.id)
          for (const a of atts) if (!a.serverPath) await uploadAtt(a)
          const fresh = await db.attsOf(note.id)
          await callJot('upsert_note', { note: stripLocal(note), atts: fresh.map(stripAtt) })
        } else if (it.type === 'note.delete' && it.noteId) {
          await callJot('delete_note', { id: it.noteId })
        } else if (it.type === 'tag.upsert' && it.name) {
          const tags = await db.listTags()
          const t = tags.find(x => x.name === it.name)
          if (t) await callJot('upsert_tag', { name: t.name, color: t.color, pinned: t.pinned })
        }
        await db.outboxDrop(it.seq!)
        if (it.noteId) await markSynced(it.noteId)
      } catch (e: any) {
        syncState.lastError = e?.message ?? String(e)
        break // 保序：失败即停，下轮重试
      }
    }
    syncState.backendUp = true
  } catch (e: any) {
    syncState.backendUp = false
    syncState.lastError = e?.message ?? String(e)
  } finally {
    pushing = false
    syncState.syncing = false
    await refreshPending()
    onChanged?.()
  }
}

export function stripLocal(n: JotNote) {
  const { syncState: _s, atts: _a, ...rest } = n as any
  return rest
}
export function stripAtt(a: JotAtt) {
  const { pendingOcr: _p, ...rest } = a as any
  return rest
}
async function markSynced(noteId: string) {
  const n = await db.getNote(noteId)
  if (n && n.syncState !== 'synced') await db.saveNote({ ...n, syncState: 'synced' }, false)
}

// ─── 拉取合并 ──────────────────────────────────────
export async function pullMerge(): Promise<number> {
  const since = (await db.kvGet<number>('lastPullRev')) ?? 0
  const snap = await callJot('snapshot', { sinceRev: since })
  let applied = 0
  for (const sn of snap.notes ?? []) {
    const local = await db.getNote(sn.id)
    if (!local || (local.syncState === 'synced' && sn.rev > (local.rev ?? 0)) || sn.rev > (local.rev ?? 0)) {
      if (local && (local.rev ?? 0) > 0 && local.syncState === 'local') {
        await db.putHistory(local) // 本地也有改动且将覆盖 → 留档（极端竞态兜底）
      }
      const note: JotNote = { ...sn, syncState: 'synced' }
      await db.saveNote(note, false)
      for (const a of sn.atts ?? []) await db.putAtt(a)
      applied++
    }
  }
  for (const t of snap.tags ?? []) {
    const tags = await db.listTags()
    if (!tags.find(x => x.name === t.name)) await db.putTag(t as any, false)
  }
  await db.kvSet('lastPullRev', snap.serverRev ?? since)
  syncState.lastPullRev = snap.serverRev ?? since
  if (applied) onChanged?.()
  return applied
}

export async function syncNow(): Promise<void> {
  if (!syncState.online) { await refreshPending(); return }
  await pushOutbox()
  try { await pullMerge() } catch { /* 拉取失败不阻塞本地使用 */ }
}

// ─── 生命周期 ──────────────────────────────────────
let timer = 0
export function startSyncLoop() {
  window.addEventListener('online', () => { syncState.online = true; void syncNow() })
  window.addEventListener('offline', () => { syncState.online = false })
  void syncNow()
  timer = window.setInterval(() => { if (!document.hidden) void syncNow() }, 60_000)
}
export function stopSyncLoop() { window.clearInterval(timer) }
