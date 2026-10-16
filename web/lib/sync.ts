/** sync.ts — 同步引擎（DESIGN 方案 B：/call 推拉，笔记级 LWW）。
 *  推送：outbox 顺序消费；媒体先于 note.upsert 上传（分块 base64）。
 *  拉取：snapshot(sinceRev) 增量合并，rev 大者胜。
 *  触发：online 事件 + 60s 前台心跳 + 手动。 */
import { reactive } from 'vue'
import { callJot, type JotAtt, type JotNote } from '../host'
import * as db from './db'
import { blobToB64 } from './image'
import { prewarmThumbs } from './media'
import { refreshMedia } from './useMedia'
import { ensureLocalThumbnail } from './thumbnails'
import { mergeMediaPaths, recoverPending } from './syncRecovery'

const CHUNK = 768 * 1024 // base64 前原始字节/块

export const syncState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  backendUp: null as boolean | null, // null=未知
  lastError: '',
  lastPullRev: 0,
})

let pushing: Promise<void> | null = null
let onChanged: (() => void | Promise<void>) | null = null
export function onSyncChanged(fn: () => void | Promise<void>) { onChanged = fn }

export async function refreshPending() {
  syncState.pending = await db.outboxCount()
}

// ─── 媒体上传 ──────────────────────────────────────
/** 归一化 mime：去掉 ;codecs= 参数（iOS 录音 blob.type 常带参数，服务端只认裸类型），空则按 kind 兜底 */
function normMime(att: JotAtt, blob: Blob): string {
  const t = (blob.type || '').split(';')[0].trim().toLowerCase()
  if (t) return t
  return att.kind === 'image' ? 'image/jpeg' : att.kind === 'video' ? 'video/mp4' : 'audio/mp4'
}

async function uploadAtt(att: JotAtt): Promise<boolean> {
  if (att.serverPath) return true
  const blob = await db.getBlob(att.id)
  if (!blob || !att.sha256) return false
  const thumb = att.kind === 'audio' ? null : await ensureLocalThumbnail(att)
  const thumbB64 = thumb ? await blobToB64(thumb) : undefined
  const begin = await callJot('upload_begin', {
    attId: att.id, kind: att.kind, mime: normMime(att, blob),
    size: blob.size, sha256: att.sha256, thumbB64,
  })
  if (begin?.exists) {
    await db.putAtt({ ...att, serverPath: begin.path, thumbPath: begin.thumbPath ?? att.thumbPath })
    return true
  }
  const b64 = await blobToB64(blob)
  const per = Math.ceil(CHUNK * 4 / 3) // 每块 base64 字符数
  let seq = 0
  for (let off = 0; off < b64.length; off += per) {
    await callJot('upload_chunk', { attId: att.id, seq: seq++, b64: b64.slice(off, off + per) })
  }
  const r = await callJot('upload_end', {
    attId: att.id, thumbB64,
  })
  await db.putAtt({ ...att, serverPath: r.path, thumbPath: r.thumbPath ?? null })
  return true
}

// ─── 推送 ──────────────────────────────────────────
/** 失败计数封顶，失败项保留供后续恢复，不阻塞其他条目。 */
const MAX_OUTBOX_ATTEMPTS = 5

/** 本地已同步全量 blob 的 LRU 上限（缩略图不计；未同步附件不参与淘汰） */
const BLOB_KEEP = 20

/** 推送成功后裁剪本地 blob：附件元数据里 serverPath 为空的（未同步成功）
 *  绝不能删——删了就永久丢；正在查看/编辑的附件刚被 touch，天然在保留头部 */
async function trimSyncedBlobs() {
  try {
    const atts = await db.allAtts()
    const protect = new Set(atts.filter(a => !a.serverPath).map(a => a.id))
    await db.trimBlobs(BLOB_KEEP, protect)
  } catch { /* 淘汰失败不影响同步主流程 */ }
}

/** 轻量探活：stats 无参数无副作用，用于区分「服务端挂了」与「本条数据坏了」 */
async function probeAlive(): Promise<boolean> {
  try { await callJot('stats'); return true } catch { return false }
}

export function pushOutbox(): Promise<void> {
  if (!syncState.online) return Promise.resolve()
  return pushing ??= drainOutbox().finally(() => { pushing = null })
}

async function drainOutbox(): Promise<void> {
  syncState.syncing = true
  let changed = false
  let failed = false
  try {
    const items = await db.outboxAll()
    for (const it of items) {
      try {
        if (it.type === 'note.upsert' && it.noteId) {
          const note = await db.getNote(it.noteId)
          if (!note) { await db.outboxDrop(it.seq!); changed = true; continue }
          const atts = await db.attsOf(note.id)
          for (const a of atts) {
            if (!a.serverPath) {
              // 媒体缺失（本地 blob/sha256 缺失）视为硬失败：不能把缺媒体的笔记同步上去
              const ok = await uploadAtt(a)
              if (!ok) throw new Error(`媒体上传失败：${a.id}`)
            }
          }
          const fresh = await db.attsOf(note.id)
          const r = await callJot('upsert_note', { note: stripLocal(note), atts: fresh.map(stripAtt) })
          if (r?.applied) await markSynced(note, r.serverRev)
          else {
            if (r?.note) await db.putHistory(r.note)
            const latest = await db.getNote(note.id)
            if (latest && r?.serverRev) await db.saveNote({ ...latest, rev: r.serverRev }, false)
            throw new Error('笔记版本已变化，保留本地编辑并等待重试')
          }
        } else if (it.type === 'note.delete' && it.noteId) {
          await callJot('delete_note', { id: it.noteId })
        } else if (it.type === 'tag.upsert' && it.name) {
          const tags = await db.listTags()
          const t = tags.find(x => x.name === it.name)
          if (t) await callJot('upsert_tag', { name: t.name, color: t.color, pinned: t.pinned })
        }
        await db.outboxDrop(it.seq!)
        changed = true
      } catch (e: any) {
        failed = true
        syncState.lastError = e?.message ?? String(e)
        console.warn('[jot] outbox 推送失败:', it.type, it.noteId ?? '', syncState.lastError)
        // 区分「服务端不可达」与「本条是坏数据」：探活失败 → 保序停推、不烧重试次数；
        // 探活成功 → 毒丸烧一次重试并跳过续推（同笔记乱序由服务端 rev LWW 兜底收敛）
        if (!(await probeAlive())) { syncState.backendUp = false; break }
        // 保留失败项及媒体，禁止五次失败后静默丢弃待同步数据。
        await db.outboxFail(it.seq!, MAX_OUTBOX_ATTEMPTS)
        continue
      }
    }
    if (!failed) syncState.backendUp = true
    await trimSyncedBlobs() // 在线才裁：离线时本地 blob 是唯一副本
  } catch (e: any) {
    syncState.backendUp = false
    syncState.lastError = e?.message ?? String(e)
  } finally {
    syncState.syncing = false
    await refreshPending()
    if (syncState.pending === 0) syncState.lastError = '' // 队列排空即清除残留错误
    if (changed) await onChanged?.() // 仅在队列确有变化时刷新 UI，避免每 60s 全量重渲染
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
async function markSynced(sent: JotNote, serverRev?: number) {
  const n = await db.getNote(sent.id)
  if (!n) return
  const rev = serverRev ?? n.rev ?? 0
  if (n.syncState === 'synced' && n.rev === rev) return
  await db.saveNote({ ...n, syncState: n.updatedAt === sent.updatedAt ? 'synced' : 'local', rev }, false)
}

// ─── 拉取合并 ──────────────────────────────────────
export async function pullMerge(full = false): Promise<number> {
  let since = full ? 0 : (await db.kvGet<number>('lastPullRev')) ?? 0
  let applied = 0
  for (let page = 0; page < 50; page++) {
    const snap = await callJot('snapshot', { sinceRev: since, limit: 500 })
    for (const sn of snap.notes ?? []) {
      const local = await db.getNote(sn.id)
      if (local && await mergeMediaPaths(sn)) applied++
      // 本地有未推送编辑：服务端版本不覆盖，避免丢本地改动（服务端版本留档兜底）
      if (local && local.syncState === 'local') {
        await db.putHistory({ ...sn })
        continue
      }
      if (local && sn.rev < (local.rev ?? 0)) continue
      const note: JotNote = { ...sn, syncState: 'synced' }
      await db.saveNote(note, false)
      // 附件差集：服务端已没有的本地附件（及 blob）删除，防孤儿数据
      const localAtts = await db.attsOf(sn.id)
      const serverIds = new Set((sn.atts ?? []).map(a => a.id))
      for (const a of localAtts) if (!serverIds.has(a.id)) await db.delAtt(a.id)
      for (const a of sn.atts ?? []) {
        const previous = localAtts.find(old => old.id === a.id && old.sha256 === a.sha256)
        await db.putAtt({ ...a, serverPath: a.serverPath || previous?.serverPath,
          thumbPath: a.thumbPath || previous?.thumbPath })
      }
      applied++
    }
    // 水位取本页最大 rev（服务端全局 serverRev 含被拒写的 rev，不能直接采用）
    since = snap.nextRev ?? since
    await db.kvSet('lastPullRev', since)
    syncState.lastPullRev = since
    if (!snap.hasMore) break
  }
  if (applied) await onChanged?.()
  return applied
}

let syncing: Promise<void> | null = null
let repairRequested = false
export function syncNow(full = false): Promise<void> {
  repairRequested ||= full
  if (syncing) return syncing
  syncing = (async () => {
    do {
      const repair = repairRequested
      repairRequested = false
      syncState.online = navigator.onLine
      if (repair) refreshMedia() // 普通心跳不打断正在播放的视频。
      if (!syncState.online) { await refreshPending(); return }
      try {
        if (repair) { await recoverPending(); await pullMerge(true) }
        await pushOutbox()
        await pullMerge()
        syncState.backendUp = true
        if (!syncState.pending) syncState.lastError = ''
      } catch (e: any) {
        syncState.backendUp = false
        syncState.lastError = e?.message ?? String(e)
      }
      if (repair) await onChanged?.()
      void prewarmThumbs()
    } while (repairRequested)
  })().finally(() => { syncing = null })
  return syncing
}

// ─── 生命周期 ──────────────────────────────────────
let timer = 0
let resumeTimer = 0
const onOnline = () => { syncState.online = true; resume() }
const onOffline = () => { syncState.online = false }
function resume() {
  if (document.hidden) return
  window.clearTimeout(resumeTimer)
  resumeTimer = window.setTimeout(() => { void syncNow(true) }, 150)
}
export function startSyncLoop() {
  stopSyncLoop()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('pageshow', resume)
  document.addEventListener('visibilitychange', resume)
  void syncNow(true)
  timer = window.setInterval(() => { if (!document.hidden) void syncNow() }, 60_000)
}
export function stopSyncLoop() {
  window.clearInterval(timer)
  window.clearTimeout(resumeTimer)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('pageshow', resume)
  document.removeEventListener('visibilitychange', resume)
}
