import * as db from '../web/lib/db'
import { copy, content } from '../web/lib/noteMerge'
import { newNote, flushSave } from '../web/state/store'
import { trackNote } from '../web/state/persistence'
import { callJot } from '../web/host'
function check(value: unknown, message: string) { if (!value) throw new Error(message) }
export async function runStorageChecks() {
  const base = newNote()
  base.title = '存储回归'
  base.text = '原正文'
  await db.saveNote({ ...base, syncState: 'synced', rev: 1 }, false)
  const original = (await db.getNote(base.id))!
  const a = { ...copy(original), text: 'A 的正文' }
  await db.editNote(a, original)
  const merged = await db.editNote({ ...copy(original), title: 'B 的标题' }, original)
  check(merged.text === 'A 的正文' && merged.title === 'B 的标题', 'same-IDB field merge')
  const conflict = await db.editNote({ ...copy(original), text: 'B 的正文' }, original)
  const history = await db.noteHistory(base.id)
  check(history.some(v => v.snap.text === 'A 的正文'), 'local conflict history')
  const changedAgain = await db.editNote({ ...conflict, text: '请求期间的新正文' }, conflict)
  await db.acceptSynced(conflict, { ...content(conflict), title: '服务端合并标题', rev: 8 })
  const ack = (await db.getNote(base.id))!
  check(ack.text === changedAgain.text && ack.syncState === 'local', 'late acknowledgement')
  check(!(await db.acceptRemote({ ...content(original), text: '过期拉取', rev: 20 })), 'pending draft protected')
  const draft = trackNote(newNote())
  draft.title = '立即离开回归'
  draft.text = '退出前必须保存'
  await flushSave(draft)
  check((await db.getNote(draft.id))?.text === draft.text, 'flush before debounce')
  const serverBase = await callJot('get_note', { id: 'fixture-30' })
  await callJot('upsert_note', { note: { ...serverBase, text: '独立客户端 A' }, base: serverBase })
  const r = await callJot('upsert_note', { note: { ...serverBase, title: '独立客户端 B' }, base: serverBase })
  check(r.note.text === '独立客户端 A' && r.note.title === '独立客户端 B', 'server field merge')
  await callJot('upsert_note', { note: { ...serverBase, text: '同字段 B' }, base: serverBase })
  const versions = await callJot('note_history', { id: 'fixture-30' })
  check(versions.some((v: any) => v.snap.text === '独立客户端 A') &&
    versions.some((v: any) => v.snap.text === '同字段 B'), 'server conflict recovery')
  return 'PASS · 8 项存储与跨端回归'
}
