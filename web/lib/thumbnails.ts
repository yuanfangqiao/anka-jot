/** 小图生成与历史封面修复；列表不会为了生成封面下载网络原片。 */
import { callJot, type JotAtt } from '../host'
import * as db from './db'
import { blobToB64, createImageThumbnail } from './image'
import { createVideoThumbnail } from './video'

const localTasks = new Map<string, Promise<Blob | null>>()
const repairs = new Map<string, Promise<{ blob: Blob | null; path?: string | null }>>()
let running = 0
const waiting: (() => void)[] = []
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  else running++
  try { return await job() }
  finally { const next = waiting.shift(); if (next) next(); else running-- }
}
export function ensureLocalThumbnail(att: JotAtt, force = false): Promise<Blob | null> {
  const active = localTasks.get(att.id)
  if (active) return active
  const task = limited(async () => {
    if (!force) {
      const existing = await db.getBlob(att.id + ':thumb')
      if (existing) return existing
    }
    // 采集时已确认浏览器不能解码的视频，直接交给服务器，不再等待第二次超时。
    if (att.kind === 'video' && (att.width === 0 || att.height === 0)) return null
    const full = await db.getBlob(att.id)
    if (!full) return null
    const thumbnail = att.kind === 'image' ? await createImageThumbnail(full)
      : att.kind === 'video' ? await createVideoThumbnail(full) : null
    if (thumbnail) await db.putBlob(att.id + ':thumb', thumbnail)
    return thumbnail
  }).catch(() => null).finally(() => localTasks.delete(att.id))
  localTasks.set(att.id, task)
  return task
}

async function saveResult(att: JotAtt, result: { path?: string; thumbPath?: string }) {
  if (!result?.thumbPath) return
  const latest = (await db.attsOf(att.noteId)).find(a => a.id === att.id)
  if (latest) await db.putAtt({ ...latest, serverPath: result.path || latest.serverPath,
    thumbPath: result.thumbPath })
}
export async function publishThumbnail(att: JotAtt, blob: Blob, force = false) {
  if (!navigator.onLine || !att.serverPath) return
  await limited(async () => {
    const result = await callJot('ensure_thumbnail', { attId: att.id,
      thumbB64: await blobToB64(blob), force })
    await saveResult(att, result)
  })
}
export function repairThumbnail(att: JotAtt, force = false): Promise<{ blob: Blob | null; path?: string | null }> {
  const active = repairs.get(att.id)
  if (active) return active
  const task = (async () => {
    const blob = await ensureLocalThumbnail(att, force)
    if (blob) {
      // 本地显示立即返回；旧数据生成的小图单独补传，不重传原片。
      void publishThumbnail(att, blob, force).catch(() => {})
      return { blob }
    }
    if (!navigator.onLine) return { blob: null }
    return limited(async () => {
      const result = await callJot('ensure_thumbnail', { attId: att.id, force })
      await saveResult(att, result)
      return { blob: null, path: result?.thumbPath as string | undefined }
    })
  })().finally(() => repairs.delete(att.id))
  repairs.set(att.id, task)
  return task
}
