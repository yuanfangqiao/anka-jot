/** sync.ts — 同步引擎（DESIGN 方案 B：/call 推拉，基准字段合并）。
 *  推送：outbox 顺序消费；媒体先于 note.upsert 上传（分块 base64）。
 *  拉取：snapshot(sinceRev) 增量合并，保护本地草稿并按基准合并。
 *  触发：online 事件 + 3s 前台增量心跳 + 手动。 */
import { reactive } from 'vue'
import { callJot, type JotAtt, type JotNote } from '../host'
import * as db from './db'
import { blobToB64, sha256Hex } from './image'
import { prewarmThumbs } from './media'
import { refreshMedia } from './useMedia'
import { ensureLocalThumbnail } from './thumbnails'
import { mergeMediaPaths, recoverPending } from './syncRecovery'
import { notifyNotes } from './noteEvents'

const CHUNK = 768 * 1024 // base64 前原始字节/块

export const syncState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  conflictNoteId: '',
  syncing: false,
  backendUp: null as boolean | null, // null=未知
  lastError: '',
  lastPullRev: 0,
})

let pushing: Promise<void> | null = null
/** 回调携带本次受影响的笔记 id：上层据此只重读这几条；不传 = 需要整表对账 */
let onChanged: ((ids?: string[]) => void | Promise<void>) | null = null
export function onSyncChanged(fn: (ids?: string[]) => void | Promise<void>) { onChanged = fn }

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

/** 上传单个附件。本地 blob 缺失或 0 字节（录音被中断、iOS 音频会话没采到数据）
 *  已无法恢复，服务端又只接受 size>0：直接丢掉这条附件元数据，
 *  否则整条笔记的 outbox 会每次同步都 400「文件大小非法」并永久卡住。 */
async function uploadAtt(att: JotAtt): Promise<boolean> {
  if (att.serverPath) return false
  const blob = await db.getBlob(att.id)
  if (!blob?.size) {
    console.warn('[jot] 丢弃损坏的本地附件（无数据）:', att.id, att.kind, blob?.size ?? 'missing')
    await db.delAtt(att.id)
    return true
  }
  // 旧数据可能没存 sha256：有数据就现算，别当成坏附件丢掉
  const sha256 = att.sha256 || await sha256Hex(blob)
  const thumb = att.kind === 'audio' ? null : await ensureLocalThumbnail(att)
  const thumbB64 = thumb ? await blobToB64(thumb) : undefined
  const begin = await callJot('upload_begin', {
    attId: att.id, kind: att.kind, mime: normMime(att, blob),
    size: blob.size, sha256, thumbB64,
  })
  if (begin?.exists) {
    await db.putAtt({ ...att, serverPath: begin.path, thumbPath: begin.thumbPath ?? att.thumbPath })
    return false
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
  return false
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
  const dirty = new Set<string>() // 本次推送真正写到的笔记
  try {
    const items = await db.outboxAll()
    for (const it of items) {
      try {
        if (it.type === 'note.upsert' && it.noteId) {
          const note = await db.getNote(it.noteId)
          if (!note) { await db.outboxDrop(it.seq!); changed = true; dirty.add(it.noteId); continue }
          const atts = await db.attsOf(note.id)
          let dropped = false
          for (const a of atts) {
            // 缺媒体的坏附件在 uploadAtt 内自愈丢弃；网络错误则抛出，交给下面的探活分支
            if (!a.serverPath && await uploadAtt(a)) dropped = true
          }
          // 坏附件是这条笔记的唯一内容（空语音壳）：整条归档，不把空笔记推上服务端
          if (dropped && !(await db.attsOf(note.id)).length
              && !(note.text || '').trim() && !(note.title || '').trim() && !note.todos?.length) {
            await db.tombstone(note.id)
            await db.outboxDrop(it.seq!)
            changed = true
            dirty.add(note.id)
            continue
          }
          const fresh = await db.attsOf(note.id)
          const r = await callJot('upsert_note', { note: stripLocal(note), mutationId: note.mutationId, base: note.syncBase ? stripLocal(note.syncBase) : undefined, atts: fresh.map(stripAtt) })
          if (r?.applied) {
            if (r.conflicts?.length) syncState.conflictNoteId = note.id
            await db.acceptSynced(note, r.note ?? { ...note, rev: r.serverRev })
            dirty.add(note.id)
          }
          else {
            if (r?.note) await db.putHistory(r.note)
            throw new Error('笔记版本已变化，保留本地编辑并等待重试')
          }
        } else if (it.type === 'note.delete' && it.noteId) {
          await callJot('delete_note', { id: it.noteId })
          dirty.add(it.noteId)
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
    // 只回报写到的笔记：上层按 id 增量 patch，不再每次自动保存都整表重载
    if (changed) { await onChanged?.([...dirty]); notifyNotes([...dirty]) }
  }
}

export function stripLocal(n: JotNote) {
  const { syncState: _s, atts: _a, syncBase: _base, mutationId: _mutation, ...rest } = n as any
  return rest
}
export function stripAtt(a: JotAtt) {
  const { pendingOcr: _p, ...rest } = a as any
  return rest
}
// ─── 拉取合并 ──────────────────────────────────────
export async function pullMerge(full = false): Promise<number> {
  let since = full ? 0 : (await db.kvGet<number>('lastPullRev')) ?? 0
  let applied = 0
  const dirty = new Set<string>() // 本次拉取真正改到的笔记
  for (let page = 0; page < 50; page++) {
    const snap = await callJot('snapshot', { sinceRev: since, limit: 500 })
    for (const sn of snap.notes ?? []) {
      const local = await db.getNote(sn.id)
      if (local && await mergeMediaPaths(sn)) { applied++; dirty.add(sn.id) }
      // 本地有未推送编辑：服务端版本不覆盖，避免丢本地改动（服务端版本留档兜底）
      if (local && local.syncState === 'local') {
        await db.putHistory({ ...sn })
        continue
      }
      if (local && sn.rev < (local.rev ?? 0)) continue
      if (!(await db.acceptRemote(sn))) continue
      dirty.add(sn.id)
      const localAtts = await db.attsOf(sn.id)
      // 只有笔记确实被删除才清附件。服务端对附件是「按 id 增量写、不隐式删」，
      // 因此「服务端快照里没有」不代表附件被删（旧客户端 / 并发覆盖都会误判），
      // 按差集删本地会连带 blob 一起丢，双设备下必现。
      if (sn.deleted) for (const a of localAtts) await db.delAtt(a.id)
      else for (const a of sn.atts ?? []) {
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
  if (applied) { await onChanged?.([...dirty]); notifyNotes([...dirty]) }
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
  timer = window.setInterval(() => { if (!document.hidden) void syncNow() }, 3_000)
}
export function stopSyncLoop() {
  window.clearInterval(timer)
  window.clearTimeout(resumeTimer)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('pageshow', resume)
  document.removeEventListener('visibilitychange', resume)
}
