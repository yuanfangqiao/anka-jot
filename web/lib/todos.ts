/** todos.ts — 正文 Markdown 待办的解析与勾选（待办页与详情共用写法：- [ ] / - [x]）。 */
import type { JotNote } from '../host'

export interface TodoItem {
  noteId: string
  /** 笔记正文中的行号（0 基） */
  line: number
  text: string
  done: boolean
  /** 所属笔记标题（无标题时取正文首行） */
  title: string
  at: number
}

const RE = /^(\s*)[-*]\s*\[([ xX])\]\s*(.*)$/

/** 扫描全部笔记，按「未完成优先 + 新笔记优先」返回待办项 */
export function collectTodos(notes: JotNote[]): TodoItem[] {
  const out: TodoItem[] = []
  for (const n of notes) {
    if (n.deleted) continue
    const lines = (n.text || '').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = RE.exec(lines[i])
      if (!m) continue
      const text = m[3].trim()
      if (!text) continue
      out.push({
        noteId: n.id,
        line: i,
        text,
        done: m[2].toLowerCase() === 'x',
        title: n.title || text,
        at: n.createdAt,
      })
    }
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || b.at - a.at)
}

// ─── 详情页「待办域」用的结构化拆分：存储仍是正文里的 - [ ] 行 ──
export interface TodoEntry {
  /** 仅前端用的稳定 key（不入库） */
  id: string
  text: string
  done: boolean
}

let seq = 0
export function newTodo(text = '', done = false): TodoEntry {
  return { id: `td${++seq}`, text, done }
}

/** 正文 → 「纯正文 + 待办数组」：待办行从任意位置提出，正文尾部空行清掉 */
export function splitTodoText(text: string): { body: string; todos: TodoEntry[] } {
  const lines = (text || '').split('\n')
  const body: string[] = []
  const todos: TodoEntry[] = []
  for (const ln of lines) {
    const m = RE.exec(ln)
    if (m) {
      const t = m[3].trim()
      if (t) { todos.push(newTodo(t, m[2].toLowerCase() === 'x')); continue }
    }
    body.push(ln)
  }
  while (body.length && !body[body.length - 1].trim()) body.pop()
  return { body: body.join('\n'), todos }
}

/** 「纯正文 + 待办数组」→ 存储文本：待办统一收在正文之后，空行分隔 */
export function composeTodoText(body: string, todos: TodoEntry[]): string {
  const b = (body || '').replace(/\s+$/, '')
  const list = todos
    .map(t => ({ text: t.text.trim(), done: t.done }))
    .filter(t => t.text)
    .map(t => `- [${t.done ? 'x' : ' '}] ${t.text}`)
    .join('\n')
  return b && list ? `${b}\n\n${list}` : (b || list)
}

/** 翻转某行的完成状态（原地改正文），返回是否成功 */
export function toggleTodoLine(note: JotNote, line: number): boolean {
  const lines = (note.text || '').split('\n')
  const m = RE.exec(lines[line] ?? '')
  if (!m) return false
  const done = m[2].toLowerCase() === 'x'
  lines[line] = `${m[1]}- [${done ? ' ' : 'x'}] ${m[3]}`
  note.text = lines.join('\n')
  return true
}
