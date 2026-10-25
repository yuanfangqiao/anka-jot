import type { JotNote } from '../host'
import { open, T, req, done, plain } from './database'
import { content, changed, copy, mergeNote } from './noteMerge'
import { notifyNotes } from './noteEvents'

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
/** 批量写笔记 + outbox 追加，同一事务（迁移/整表修复用，避免逐条事务放大） */
export async function saveNotes(list: JotNote[], queueSync = true) {
  if (!list.length) return
  const d = await open()
  const t = d.transaction([T.notes, T.outbox], 'readwrite')
  const store = t.objectStore(T.notes)
  const outbox = t.objectStore(T.outbox)
  const at = Date.now()
  for (const note of list) {
    store.put(plain(note))
    if (queueSync) outbox.add({ type: 'note.upsert', noteId: note.id, createdAt: at })
  }
  await done(t)
}
/** 写笔记 + 附件元数据 + outbox 追加，同一事务（离线队列原子性） */
export async function saveNote(note: JotNote, queueSync = true) {
  await saveNotes([note], queueSync)
}
export async function tombstone(id: string) {
  const d = await open()
  const t = d.transaction([T.notes, T.outbox], 'readwrite')
  const n = await req<JotNote | undefined>(t.objectStore(T.notes).get(id))
  if (n) t.objectStore(T.notes).put({ ...n, deleted: true, updatedAt: Date.now() })
  t.objectStore(T.outbox).add({ type: 'note.delete', noteId: id, createdAt: Date.now() })
  await done(t)
}
export async function putHistory(note: JotNote) {
  const d = await open()
  const t = d.transaction(T.history, 'readwrite')
  t.objectStore(T.history).add({ noteId: note.id, snap: plain(note), at: Date.now() })
  await done(t)
}

export async function noteHistory(noteId: string): Promise<{ at: number; snap: JotNote; reason?: string }[]> {
  const d = await open()
  return req(d.transaction(T.history).objectStore(T.history).index('noteId').getAll(noteId))
}

/** Read/merge/write/outbox are one transaction, including across browser tabs. */
export async function editNote(draft: JotNote, base: JotNote, force = false): Promise<JotNote> {
  draft = plain(draft); base = plain(base)
  const d = await open()
  const t = d.transaction([T.notes, T.outbox, T.history], 'readwrite')
  const store = t.objectStore(T.notes)
  const latest = await req<JotNote | undefined>(store.get(draft.id))
  if (latest?.deleted && !base.deleted) {
    t.objectStore(T.history).add({ noteId: draft.id, snap: draft, at: Date.now(), reason: '删除后的编辑' })
    await done(t); return latest
  }
  const { next, conflicts } = mergeNote(base, draft, latest ?? base)
  if (latest && !changed(latest, next) && !force) { await done(t); return latest }
  if (latest) t.objectStore(T.history).add({ noteId: draft.id, snap: content(latest),
    at: Date.now(), reason: conflicts.length ? '冲突版本' : '修改前' })
  next.syncBase = latest?.syncBase ?? content(latest?.syncState === 'synced' ? latest : base)
  next.updatedAt = Math.max(Date.now(), (latest?.updatedAt ?? 0) + 1)
  next.syncState = 'local'
  next.mutationId = crypto.randomUUID()
  store.put(next)
  t.objectStore(T.outbox).add({ type: 'note.upsert', noteId: next.id, createdAt: next.updatedAt })
  await done(t)
  notifyNotes([next.id])
  return next
}

/** A late acknowledgement must not erase edits made during the request. */
export async function acceptSynced(sent: JotNote, remote: JotNote) {
  const d = await open()
  const t = d.transaction(T.notes, 'readwrite')
  const store = t.objectStore(T.notes)
  const latest = await req<JotNote | undefined>(store.get(sent.id))
  if (latest) {
    const { next } = mergeNote(sent, latest, remote)
    next.updatedAt = changed(sent, latest) ? latest.updatedAt : remote.updatedAt
    next.syncBase = content(remote)
    if (changed(sent, latest)) next.mutationId = latest.mutationId
    next.syncState = changed(next, remote) ? 'local' : 'synced'
    store.put(plain(next))
  }
  await done(t)
}

/** Pulls compare the local state inside the write transaction, never before it. */
export async function acceptRemote(remote: JotNote): Promise<boolean> {
  const d = await open()
  const t = d.transaction([T.notes, T.history], 'readwrite')
  const store = t.objectStore(T.notes)
  const latest = await req<JotNote | undefined>(store.get(remote.id))
  if (latest && (latest.syncState === 'local' || latest.rev > remote.rev)) {
    await done(t); return false
  }
  if (latest && changed(latest, remote)) t.objectStore(T.history).add({
    noteId: latest.id, snap: content(latest), at: Date.now(), reason: '同步前' })
  store.put(plain({ ...remote, syncBase: content(remote), syncState: 'synced' }))
  await done(t)
  return true
}

