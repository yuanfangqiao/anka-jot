/** media.ts — 服务端媒体回填：本地 blob 缺失时按 serverPath/thumbPath 拉回本地缓存。
 *  显示层已由组件里的 mediaUrl() 兜底（宿主静态伺服 /plugins/<id>/data/...），
 *  回填只为「下次离线也能看」——拉回的 blob 自然进入 LRU 管辖（超 20 个被淘汰）。 */
import { mediaUrl, type JotAtt } from '../host'
import * as db from './db'
import { syncState } from './sync'

/** 本地缺失时从服务端拉回缓存；在线才回填，失败静默（下次触发再试） */
export async function backfillAtt(att: JotAtt, kind: 'full' | 'thumb' = 'full') {
  if (!syncState.online) return
  const key = kind === 'thumb' ? att.id + ':thumb' : att.id
  if (await db.getBlob(key)) return
  const url = mediaUrl(kind === 'thumb' ? att.thumbPath : att.serverPath)
  if (!url) return
  try {
    const r = await fetch(url)
    if (!r.ok) return
    await db.putBlob(key, await r.blob())
  } catch { /* 网络失败静默 */ }
}
