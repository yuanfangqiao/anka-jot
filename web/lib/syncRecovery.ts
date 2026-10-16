/** 修复旧版本跳过的附件路径；保留本地未同步正文和附件增删。 */
import type { JotNote } from '../host'
import * as db from './db'

export async function mergeMediaPaths(remote: JotNote): Promise<boolean> {
  let changed = false
  const local = await db.attsOf(remote.id)
  for (const incoming of remote.atts ?? []) {
    const att = local.find(a => a.id === incoming.id)
    if (!att || (att.sha256 && incoming.sha256 && att.sha256 !== incoming.sha256)) continue
    const serverPath = att.serverPath || incoming.serverPath
    const thumbPath = att.thumbPath || incoming.thumbPath
    if (serverPath === att.serverPath && thumbPath === att.thumbPath) continue
    await db.putAtt({ ...att, serverPath, thumbPath })
    changed = true
  }
  return changed
}

/** 旧写穿透可能标记 synced，却没有上传媒体；旧死信策略也可能删掉待传队列。 */
export async function recoverPending() {
  const queued = new Set((await db.outboxAll()).map(it => it.noteId))
  for (const note of await db.listNotes()) {
    if (queued.has(note.id)) continue
    let needsUpload = false
    for (const att of await db.attsOf(note.id)) {
      if (!att.serverPath && await db.getBlob(att.id)) { needsUpload = true; break }
    }
    if (note.syncState === 'local' || needsUpload) {
      await db.saveNote({ ...note, syncState: 'local' }, true)
    }
  }
}
