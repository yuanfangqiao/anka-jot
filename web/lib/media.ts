/** media.ts — 服务端媒体回填：本地 blob 缺失时按 serverPath/thumbPath 拉回本地缓存。
 *  显示层已由组件里的 mediaUrl() 兜底（宿主静态伺服 /plugins/<id>/data/...），
 *  回填只为「下次离线也能看」——拉回的 blob 自然进入 LRU 管辖（超 20 个被淘汰）。 */
import { mediaUrl, type JotAtt } from '../host'
import * as db from './db'


const inflight = new Map<string, Promise<void>>()
/** 显示不依赖回填；同一附件合并下载，超时覆盖响应体读取。 */
export function backfillAtt(att: JotAtt, kind: 'full' | 'thumb' = 'full'): Promise<void> {
  const key = kind === 'thumb' ? att.id + ':thumb' : att.id
  if (!navigator.onLine) return Promise.resolve()
  const pending = inflight.get(key)
  if (pending) return pending
  const task = fill(att, key, kind).finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}
async function fill(att: JotAtt, key: string, kind: 'full' | 'thumb') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    if (await db.getBlob(key)) return
    const url = mediaUrl(kind === 'thumb' ? att.thumbPath : att.serverPath)
    if (!url) return
    const r = await fetch(url, { signal: controller.signal, cache: 'no-cache' })
    if (!r.ok || r.headers.get('content-type')?.includes('text/html')) return
    await db.putBlob(key, await r.blob())
  } catch { /* 下次恢复或显示时重试 */ }
  finally { clearTimeout(timer) }
}

/** 缩略图预热：在线时把本地缺失的封面缩略图立即从服务端拉回——「打开即可预览」，
 *  且离线前已提前缓存好。并发 4 防手机端拥塞；幂等可重入（已有缓存自动跳过），
 *  由 syncNow（60s 心跳/回网/回前台）反复触发直至补齐 */
let prewarming = false
export async function prewarmThumbs(limit = 60): Promise<void> {
  if (!navigator.onLine || prewarming) return
  prewarming = true
  try {
    const atts = await db.allAtts()
    const todos = atts.filter(a =>
      (a.kind === 'image' || a.kind === 'video') && (a.thumbPath || a.serverPath))
    let cursor = 0
    let done = 0
    const worker = async () => {
      while (done < limit && cursor < todos.length) {
        const a = todos[cursor++]
        await backfillAtt(a, 'thumb')
        done++
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
  } catch { /* 静默：下轮 sync 自动再试 */ } finally { prewarming = false }
}
