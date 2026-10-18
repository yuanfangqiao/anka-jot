/** todos.ts — 结构化事项工具。
 *  事项自 v2 起独立存储在 note.todos（不再写进正文），
 *  这里只保留：新建、历史正文 `- [ ]` 行的无损拆分、数据归一与统计。 */
import type { JotNote, JotTodo } from '../host'

/** 历史正文里的 Markdown 复选框行（仅迁移用） */
const LEGACY_RE = /^(\s*)[-*]\s*\[([ xX])\]\s*(.*)$/

function uid(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function newTodo(text = '', done = false): JotTodo {
  return { id: uid(), text, done }
}

/** 正文 → 「纯正文 + 事项」：历史笔记的复选框行从任意位置提出，尾部空行清掉。 */
export function splitTodoText(text: string): { body: string; todos: JotTodo[] } {
  const lines = (text || '').split('\n')
  const body: string[] = []
  const todos: JotTodo[] = []
  for (const ln of lines) {
    const m = LEGACY_RE.exec(ln)
    if (m) {
      const t = m[3].trim()
      if (t) { todos.push(newTodo(t, m[2].toLowerCase() === 'x')); continue }
    }
    body.push(ln)
  }
  while (body.length && !body[body.length - 1].trim()) body.pop()
  return { body: body.join('\n'), todos }
}

/** 迁移/读取归一：补齐 todo 标志与 todos 数组，并把正文残留的复选框行拆进数组。
 *  原地修改并返回是否发生变更（调用方决定是否落库）；**不碰 updatedAt**，避免时间线重排。 */
export function normalizeNoteTodos(n: JotNote): boolean {
  let changed = false
  // 缺字段只补默认值、不算变更：避免升级后首启把所有老笔记都推进 outbox
  if (n.todo === undefined) n.todo = false
  else if (typeof n.todo !== 'boolean') { n.todo = Boolean(n.todo); changed = true }
  if (n.todos === undefined) n.todos = []
  else if (!Array.isArray(n.todos)) { n.todos = []; changed = true }

  const legacy = splitTodoText(n.text || '')
  if (legacy.todos.length) {
    n.text = legacy.body
    n.todos = [...n.todos, ...legacy.todos]
    changed = true
  }

  const seen = new Set<string>()
  const clean: JotTodo[] = []
  for (const raw of n.todos) {
    if (!raw || typeof raw !== 'object') { changed = true; continue }
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (!text) { changed = true; continue }
    let id = typeof raw.id === 'string' ? raw.id : ''
    if (!id || seen.has(id)) { id = uid(); changed = true }
    seen.add(id)
    const done = Boolean(raw.done)
    if (done !== raw.done || text !== raw.text || id !== raw.id) changed = true
    clean.push({ id, text, done })
  }
  if (clean.length !== n.todos.length) changed = true
  n.todos = clean
  return changed
}

/** 卡片/待办页的进度统计（空列表 total=0） */
export function todoStat(todos?: JotTodo[]): { total: number; done: number; pct: number } {
  const list = todos ?? []
  let done = 0
  for (const t of list) if (t.done) done++
  const total = list.length
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

/** 搜索用：把事项文本拼成一段（不参与展示） */
export function todoText(todos?: JotTodo[]): string {
  return (todos ?? []).map(t => t.text).join('\n')
}
