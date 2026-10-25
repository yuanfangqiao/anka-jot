import type { JotNote } from '../host'

export const EDIT_FIELDS = ['title', 'text', 'tags', 'source', 'pinned', 'fav', 'todo',
  'todos', 'color', 'location', 'deleted'] as const
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function content(note: JotNote): JotNote {
  const { syncBase: _base, syncState: _state, atts: _atts, mutationId: _mutation, ...rest } = copy(note)
  return rest as JotNote
}
export function changed(a: JotNote, b: JotNote) {
  return EDIT_FIELDS.some(k => !equal(a[k], b[k]))
}
/** Apply only changes made since base. Conflicting values remain recoverable in history. */
export function mergeNote(base: JotNote, draft: JotNote, latest: JotNote) {
  const next = copy(latest)
  next.id = draft.id
  const conflicts: string[] = []
  for (const key of EDIT_FIELDS) {
    if (equal(draft[key], base[key])) continue
    if (!equal(latest[key], base[key]) && !equal(draft[key], latest[key])) conflicts.push(key)
    ;(next as any)[key] = copy(draft[key] ?? null)
  }
  return { next, conflicts }
}
