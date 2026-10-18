/** search.ts — 客户端全文索引：中文 bigram + 英文按词，权重排序。
 *  千条笔记内存占用约 2-3MB；文档变更增量更新。 */
import type { JotAtt, JotNote } from '../host'
import { todoText } from './todos'

export interface Hit {
  noteId: string; title: string; updatedAt: number
  field: 'title' | 'text' | 'ocr' | 'transcript' | 'todo'
  snippet: string; score: number
}

interface Doc { id: string; updatedAt: number; fields: [string, string, string, string, string] }

const WEIGHT = [3, 2, 1, 1, 1] // title > text > ocr/transcript/todo
const FIELD_NAME = ['title', 'text', 'ocr', 'transcript', 'todo'] as const
const FIELD_COUNT = FIELD_NAME.length

export class SearchIndex {
  private docs = new Map<string, Doc>()
  private index = new Map<string, Set<string>>() // term → noteIds

  static tokenize(s: string): string[] {
    const out: string[] = []
    const re = /[a-z0-9]+|[一-鿿]/g
    let m: RegExpExecArray | null
    const lower = s.toLowerCase()
    // 英文/数字整词
    const wordRe = /[a-z0-9]+/g
    while ((m = wordRe.exec(lower))) out.push(m[0])
    // 中文 bigram（单字也入，保证单字可搜）
    const chars = lower.match(/[一-鿿]/g) ?? []
    out.push(...chars)
    for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1])
    return out
  }

  upsert(note: JotNote, atts: JotAtt[]) {
    this.remove(note.id)
    if (note.deleted) return
    const ocr = atts.map(a => a.ocrText ?? '').join('\n')
    const tr = atts.flatMap(a => (a.transcript ?? []).map(s => s.text)).join('\n')
    const doc: Doc = {
      id: note.id, updatedAt: note.updatedAt,
      fields: [note.title ?? '', note.text ?? '', ocr, tr, todoText(note.todos)],
    }
    this.docs.set(note.id, doc)
    const terms = new Set<string>()
    for (const f of doc.fields) for (const t of SearchIndex.tokenize(f)) terms.add(t)
    for (const t of terms) {
      let set = this.index.get(t)
      if (!set) this.index.set(t, (set = new Set()))
      set.add(note.id)
    }
  }

  remove(id: string) {
    if (!this.docs.has(id)) return
    this.docs.delete(id)
    for (const [, set] of this.index) set.delete(id)
  }

  query(q: string, limit = 50): Hit[] {
    const terms = [...new Set(SearchIndex.tokenize(q))]
    if (!terms.length) return []
    const score = new Map<string, { s: number; field: number }>()
    for (const t of terms) {
      const ids = this.index.get(t)
      if (!ids) continue
      for (const id of ids) {
        const doc = this.docs.get(id)!
        // 找到该 term 命中的最高权重字段
        for (let fi = 0; fi < FIELD_COUNT; fi++) {
          if (doc.fields[fi].toLowerCase().includes(t) || doc.fields[fi].includes(t)) {
            const cur = score.get(id)
            const s = WEIGHT[fi] * (t.length > 1 ? 2 : 1)
            if (!cur || cur.s < s) score.set(id, { s: (cur?.s ?? 0) + s, field: fi })
            else score.set(id, { s: cur.s + s, field: Math.min(cur.field, fi) })
            break
          }
        }
      }
    }
    const ql = q.toLowerCase()
    return [...score.entries()]
      .map(([id, v]) => {
        const doc = this.docs.get(id)!
        const text = doc.fields[v.field]
        let i = text.toLowerCase().indexOf(ql)
        if (i < 0) i = Math.max(0, text.toLowerCase().indexOf(terms[0]))
        const s = Math.max(0, i - 20)
        return {
          noteId: id, title: doc.fields[0] || '未命名', updatedAt: doc.updatedAt,
          field: FIELD_NAME[v.field] as Hit['field'],
          snippet: text.slice(s, i + q.length + 40),
          score: v.s + doc.updatedAt / 1e15, // 时间近微弱加权
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}
